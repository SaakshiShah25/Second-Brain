import { ApiError } from '../api/client'
import { report } from './errorReporting'

// One place that turns any failure into what the person is told: what happened, what to do, and (for a fault on
// our side) a reference code to quote when they contact us. The backend has already counted the failure for the
// admin page ("Most common problems"); a failure that never reached it is reported separately (errorReporting.ts).
export interface FriendlyError {
  title: string
  message: string
  // What to do next.
  hint: string
  // Reference code the backend logged the failure under, if it did.
  code?: string
  status: number
}

export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined

type Listener = (e: FriendlyError) => void
const listeners = new Set<Listener>()
export function onFriendlyError(l: Listener) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The wording for an error, or null when it is not for a popup (a stopped request; a session that ended, which
 *  sends the person to sign in; the invite-only screen). */
export function describeError(err: unknown): FriendlyError | null {
  if (err instanceof DOMException && err.name === 'AbortError') return null
  if (err instanceof ApiError) {
    const { status, message, errorId } = err
    if (status === 401 || message === 'invite_only') return null
    // The backend appends "(reference 4F1A9C)" to server faults; the code is shown on its own line instead.
    const clean = message.replace(/\s*\(reference [0-9A-F]+\)\.?/i, '.').replace(/\.\.$/, '.')
    const code = errorId ?? /reference ([0-9A-F]+)/i.exec(message)?.[1]
    if (status === 0)
      return { title: 'No connection', message: clean, hint: 'Check your internet and try again. Nothing you typed was lost.', status }
    if (status === 429)
      return { title: 'Slow down for a moment', message: clean, hint: 'This is a limit, not a fault. Wait a minute (or until tomorrow, for a daily limit) and try again.', status }
    if (status === 403)
      return { title: "You can't do that", message: clean, hint: "If you think this is a mistake, contact us and we'll look into it.", status }
    if (status >= 500)
      return { title: 'Something went wrong on our side', message: clean, hint: "We've been alerted. Try again in a minute; if it keeps happening, contact us with the reference code.", code, status }
    return { title: "That didn't work", message: clean, hint: 'Check what you entered and try again.', code, status }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { title: 'Something went wrong', message: message || 'An unexpected problem came up.', hint: 'Try again; if it keeps happening, contact us.', status: -1 }
}

let last = { key: '', at: 0 }

/** Shows the popup for an error. The same message is not shown twice within `quietMs` (a failing screen that
 *  retries must not stack popups). */
export function showError(err: unknown, quietMs = 8000) {
  const friendly = describeError(err)
  if (!friendly) return
  const key = `${friendly.status}:${friendly.message}`
  const now = Date.now()
  if (key === last.key && now - last.at < quietMs) return
  last = { key, at: now }
  // A failure inside the app itself never reached the server, so it is reported (message and screen only).
  if (friendly.status === -1) report(friendly.message, err instanceof Error ? err.stack : undefined)
  listeners.forEach((l) => l(friendly))
}
