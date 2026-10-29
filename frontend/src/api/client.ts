import { reportReachable, reportUnreachable } from '../lib/connection'
import { supabase } from '../lib/supabase'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const INVITE_ONLY_EVENT = 'confia:invite-only'

export class ApiError extends Error {
  status: number
  // Reference code the backend logged this failure under (observability.py) -
  // already part of `message`, kept separately for anything that wants it.
  errorId?: string
  constructor(status: number, message: string, errorId?: string) {
    super(message)
    this.status = status
    this.errorId = errorId
  }
  // So `String(error)` / template strings show the readable message alone.
  toString() {
    return this.message
  }
}

// fetch() itself failing means the request never reached the server.
const UNREACHABLE =
  "Couldn't reach MyConfía - check your internet connection. If you're online, the server may be starting up; try again in a minute."

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    const res = await fetch(url, init)
    reportReachable() // any answer at all means the server is reachable
    return res
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    reportUnreachable() // the connection strip shows it and re-checks until the server answers
    throw new ApiError(0, UNREACHABLE)
  }
}

// Sends a request with the signed-in user's token. A 401 means the token was rejected (it can expire while
// the app sits in the background): get a fresh one and try once more before giving up. Only if that also
// fails is the session really over - the user is signed out (RequireAuth then shows the login screen)
// instead of being left with a bare "Invalid or expired session".
const SESSION_OVER = 'Your session has expired - please sign in again.'

async function authedSend(url: string, build: (token: string | null) => RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const res = await send(url, build(data.session?.access_token ?? null))
  if (res.status !== 401) return res

  const refreshed = await supabase.auth.refreshSession()
  const token = refreshed.data.session?.access_token
  if (token) {
    const retry = await send(url, build(token))
    if (retry.status !== 401) return retry
  }
  await supabase.auth.signOut({ scope: 'local' })
  throw new ApiError(401, SESSION_OVER)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData

  const res = await authedSend(`${BASE_URL}${path}`, (token) => ({
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  }))

  if (!res.ok) {
    let detail = res.statusText
    let errorId: string | undefined
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : detail
      errorId = body.error_id
    } catch {
      // response body wasn't JSON - fall back to statusText
    }
    // An account that isn't on the invite list (api/auth.py) - RequireAuth
    // swaps the whole app for a "not invited yet" screen.
    if (res.status === 403 && detail === 'invite_only') window.dispatchEvent(new Event(INVITE_ONLY_EVENT))
    throw new ApiError(res.status, detail, errorId)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// Parses a Server-Sent Events stream (api/routers/chat.py's /api/chat/stream)
// by hand via fetch + a ReadableStream reader, rather than the browser's
// native EventSource - EventSource only supports GET with no custom
// headers, which can't carry the Supabase Authorization bearer token this
// app needs on every request. fetch's streaming body + AbortSignal cover
// the same ground (including the chat page's existing Stop button) with
// no extra library.
export async function postStream<T>(
  path: string,
  body: unknown,
  onStage: (stage: string) => void,
  signal?: AbortSignal,
): Promise<T> {
  const res = await authedSend(`${BASE_URL}${path}`, (token) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  }))

  if (!res.ok || !res.body) {
    let detail = res.statusText
    try {
      const errBody = await res.json()
      detail = typeof errBody.detail === 'string' ? errBody.detail : detail
    } catch {
      // response body wasn't JSON - fall back to statusText
    }
    if (res.status === 403 && detail === 'invite_only') window.dispatchEvent(new Event(INVITE_ONLY_EVENT))
    throw new ApiError(res.status, detail)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: T | undefined
  let error: { detail: string; status_code: number; error_id?: string } | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? '' // keep any not-yet-complete event for next chunk
    for (const raw of events) {
      if (!raw.trim()) continue
      let event = 'message'
      let data = ''
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      const parsed = JSON.parse(data)
      if (event === 'stage') onStage(parsed as string)
      else if (event === 'result') result = parsed as T
      else if (event === 'error') error = parsed
    }
  }

  if (error) throw new ApiError(error.status_code, error.detail, error.error_id)
  if (result === undefined) throw new ApiError(0, 'Stream ended with no result')
  return result
}

// Authenticated binary download (document files, thumbnails, ZIP
// exports) - documents are never exposed through public/signed Storage
// URLs, so every byte comes through the API with the user's own token.
export async function fetchBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const res = await send(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...init.headers,
    },
  })
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return res.blob()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  // `signal` lets a caller cancel an in-flight POST (e.g. a "Stop"
  // button on a chat send) - passed straight through to fetch's own
  // AbortSignal support, nothing custom needed.
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    }),
  postStream,
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
