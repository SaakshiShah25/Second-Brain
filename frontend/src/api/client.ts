import { supabase } from '../lib/supabase'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      // response body wasn't JSON - fall back to statusText
    }
    throw new ApiError(res.status, detail)
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
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok || !res.body) {
    let detail = res.statusText
    try {
      const errBody = await res.json()
      detail = errBody.detail ?? detail
    } catch {
      // response body wasn't JSON - fall back to statusText
    }
    throw new ApiError(res.status, detail)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: T | undefined
  let error: { detail: string; status_code: number } | undefined

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

  if (error) throw new ApiError(error.status_code, error.detail)
  if (result === undefined) throw new ApiError(0, 'Stream ended with no result')
  return result
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
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
