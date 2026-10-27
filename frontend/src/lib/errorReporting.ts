import { api, ApiError } from '../api/client'

// Sends uncaught errors to the backend (POST /api/client-error), which
// forwards them to Sentry when it's configured. Only the message, stack and
// the screen's path go out - never note text. A few per page load at most,
// and the same error only once, so a render loop can't flood it.
const MAX_REPORTS = 5
const sent = new Set<string>()

function report(message: string, stack?: string) {
  if (!message || sent.size >= MAX_REPORTS || sent.has(message)) return
  sent.add(message)
  api.post('/api/client-error', { message, stack, path: window.location.pathname }).catch(() => {})
}

export function installErrorReporting() {
  if (import.meta.env.DEV) return
  window.addEventListener('error', (e) => report(e.message, e.error instanceof Error ? e.error.stack : undefined))
  window.addEventListener('unhandledrejection', (e) => {
    const err = e.reason
    // Expected API failures (network, 4xx) are shown in the UI already.
    if (err instanceof ApiError) return
    report(err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : undefined)
  })
}
