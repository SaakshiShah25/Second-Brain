import { supabase } from '../lib/supabase'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// How long to wait before giving up on a request. A request that never
// answers (a weak signal that neither fails nor completes) used to leave the
// app waiting forever with only the Stop button as a way out.
const REQUEST_TIMEOUT_MS = 45_000
const UPLOAD_TIMEOUT_MS = 60_000 // recordings and photos take longer to send
// The very first byte of a chat stream can take a while when the backend has
// been asleep (a free-tier Render instance needs up to ~a minute to wake), so
// that wait is longer; after the first event, silence for 45s means stuck.
const STREAM_FIRST_BYTE_TIMEOUT_MS = 60_000

/** The server didn't answer in time. `maybeProcessed` is true when the
 * request could have reached the server and acted (anything that writes):
 * the caller should warn before the user sends it again. */
export class RequestTimeoutError extends Error {
  maybeProcessed: boolean
  constructor(maybeProcessed: boolean) {
    super('Request timed out')
    this.maybeProcessed = maybeProcessed
  }
}

/** The connection dropped after a request was sent, while waiting for or
 * reading the answer - the server may well have finished the work. */
export class ConnectionLostError extends Error {
  maybeProcessed = true
  constructor() {
    super('Connection lost')
  }
}

/** True when a failed request may nevertheless have been carried out. */
export function maybeProcessed(err: unknown): boolean {
  return (err instanceof RequestTimeoutError || err instanceof ConnectionLostError) && err.maybeProcessed
}

// A deadline that can be pushed back (for streams, where "no activity for
// 45s" is the failure, not "total time over 45s") and that still honours the
// caller's own cancel (the chat Stop button): that is NOT reported as a
// timeout.
function withDeadline(ms: number, external?: AbortSignal | null) {
  const controller = new AbortController()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout>
  const arm = (delay: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, delay)
  }
  arm(ms)
  const onExternalAbort = () => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }
  return {
    signal: controller.signal,
    arm,
    timedOut: () => timedOut,
    clear: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
  }
}

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

  const isRead = (options.method ?? 'GET').toUpperCase() === 'GET'
  const deadline = withDeadline(isFormData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS, options.signal)
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: deadline.signal,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...options.headers,
      },
    })
  } catch (err) {
    if (deadline.timedOut()) throw new RequestTimeoutError(!isRead)
    throw err
  } finally {
    deadline.clear()
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : detail
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

  const deadline = withDeadline(STREAM_FIRST_BYTE_TIMEOUT_MS, signal)
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: deadline.signal,
    })
  } catch (err) {
    deadline.clear()
    if (deadline.timedOut()) throw new RequestTimeoutError(true)
    throw err
  }

  if (!res.ok || !res.body) {
    deadline.clear()
    let detail = res.statusText
    try {
      const errBody = await res.json()
      detail = typeof errBody.detail === 'string' ? errBody.detail : detail
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
    let chunk: ReadableStreamReadResult<Uint8Array>
    try {
      deadline.arm(REQUEST_TIMEOUT_MS) // silence from here on means stuck
      chunk = await reader.read()
    } catch (err) {
      deadline.clear()
      if (deadline.timedOut()) throw new RequestTimeoutError(true)
      // The caller's own Stop button: let the AbortError through as before.
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      // Anything else while reading is the connection dropping mid-answer.
      throw new ConnectionLostError()
    }
    const { done, value } = chunk
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

  deadline.clear()
  if (error) throw new ApiError(error.status_code, error.detail)
  // The stream closed without ever delivering a result: the connection was
  // cut before the server finished, so it may have saved the note.
  if (result === undefined) throw new ConnectionLostError()
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
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
