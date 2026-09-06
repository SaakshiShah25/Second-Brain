// appLock.ts — local PIN-lock storage, used by AppLockGate.tsx.
//
// Deliberately device-local (localStorage), not synced through the
// backend like terms_accepted_at/tour_completed_at - the whole point of
// an app-lock is to protect a specific physical device someone else
// might pick up, so it must be set independently on each device, not
// carried over from account state. The real authentication is still
// Supabase Auth's session (this never replaces that) - this is only a
// second, local gate on RESUMING an already-logged-in session.
//
// The PIN itself is never stored - only a salted SHA-256 hash, via the
// Web Crypto API already available in every browser this app targets
// (no extra dependency). This is defense-in-depth (protects against
// something merely reading localStorage, e.g. a browser extension or a
// device backup) rather than a claim of real cryptographic security -
// someone with actual access to unlocked devtools on this device could
// still bypass the gate in-memory, same limitation every client-side
// app-lock has (this is a "away from the phone for a minute" deterrent,
// not encryption).

const STORAGE_KEY = 'confia_app_lock'

interface StoredLock {
  salt: string
  hash: string
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bufferToHex(digest)
}

function readStored(): StoredLock | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredLock) : null
  } catch {
    // Private-browsing/blocked storage, or corrupted JSON - treat as "no
    // lock configured" rather than throwing, same fail-quiet contract as
    // every other localStorage read in this app.
    return null
  }
}

export function isAppLockEnabled(): boolean {
  return readStored() !== null
}

export async function setAppLockPin(pin: string): Promise<void> {
  const salt = bufferToHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  const hash = await hashPin(pin, salt)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ salt, hash }))
  } catch {
    // Storage blocked/full - the caller's UI should already be checking
    // isAppLockEnabled() right after to confirm this actually took, so
    // no separate error path is needed here.
  }
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = readStored()
  if (!stored) return false
  const attempt = await hashPin(pin, stored.salt)
  return attempt === stored.hash
}

export function disableAppLock(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // See setAppLockPin - nothing more to do if storage is unavailable.
  }
}
