// A small, device-side brake on repeated failed sign-ins. After
// FREE_ATTEMPTS wrong passwords in a row the sign-in button waits, with the
// wait doubling on each further miss (30s, 1m, 2m ... capped at 15 min).
// It survives a page refresh (localStorage) and resets on a good sign-in.
//
// Be clear about what this is: a speed bump and a friendly message for a
// real person who keeps mistyping. It is NOT the security control - anyone
// scripting requests skips this page entirely. The real protections live in
// Supabase Auth (per-IP rate limits and, when switched on, CAPTCHA - see
// components/Captcha.tsx and the README's "Sign-up and sign-in protection").

const KEY = 'confia_signin_attempts'
const FREE_ATTEMPTS = 5
const BASE_MS = 30_000
const MAX_MS = 15 * 60_000

interface State {
  fails: number
  lockedUntil: number
}

function read(): State {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as State | null
    if (parsed && Number.isFinite(parsed.fails) && Number.isFinite(parsed.lockedUntil)) return parsed
  } catch {
    // unreadable storage - start clean
  }
  return { fails: 0, lockedUntil: 0 }
}

function write(state: State): void {
  try {
    if (state.fails === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage blocked - the wait then only lasts until the page reloads
  }
}

export function signInWaitMs(now: number = Date.now()): number {
  return Math.max(0, read().lockedUntil - now)
}

export function recordSignInFailure(now: number = Date.now()): number {
  const fails = read().fails + 1
  const over = fails - FREE_ATTEMPTS
  const lockedUntil = over >= 0 ? now + Math.min(BASE_MS * 2 ** over, MAX_MS) : 0
  write({ fails, lockedUntil })
  return Math.max(0, lockedUntil - now)
}

export function resetSignInFailures(): void {
  write({ fails: 0, lockedUntil: 0 })
}

export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) return `${seconds} seconds`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest}s`
}
