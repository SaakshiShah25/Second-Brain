import { ApiError } from '../api/client'

const GENERIC = "That didn't go through. Please try again in a moment."

/** Turns whatever a failed request threw into a sentence a person can act
 * on. Never shows raw server text for a server-side failure - those carry
 * stack-trace-ish detail ("Extraction failed: Error code 429 - {...}")
 * that means nothing to the reader and reads like the app is broken.
 * Messages the backend writes on purpose for the user (a 4xx like "Didn't
 * catch anything in that recording - try again.", a plan-limit notice)
 * are passed through as-is. `fallback` lets a caller give a more specific
 * generic line for its own action. */
export function friendlyMessage(err: unknown, fallback: string = GENERIC): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "You're going a little fast - please wait a moment and try again."
    if (err.status === 401) return 'Your session has expired - please sign in again.'
    // The safety check being briefly unavailable (the backend sends this
    // wording on purpose) - tell them to retry rather than showing the generic line.
    if (err.status === 503 && err.message.includes('safety check')) return err.message
    if (err.status >= 400 && err.status < 500 && err.message && !err.message.startsWith('[object')) {
      return err.message
    }
    return fallback
  }
  // fetch() itself rejecting (offline, server unreachable) throws a TypeError
  if (err instanceof TypeError) return "Can't reach MyConfía right now - check your connection and try again."
  return fallback
}
