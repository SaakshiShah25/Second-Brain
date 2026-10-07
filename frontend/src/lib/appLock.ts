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
// The PIN itself is never stored - only a salted hash, via the Web
// Crypto API already available in every browser this app targets (no
// extra dependency): PBKDF2-SHA256 with PBKDF2_ITERATIONS rounds, so
// each guess costs real time. (Locks made by earlier versions used one
// round of salted SHA-256; they still work and are upgraded in place the
// next time the PIN is entered correctly.) A 4-6 digit PIN only has
// 10^4 - 10^6 possibilities, so hashing slows an attacker who has read
// localStorage but cannot make a short PIN strong - which is why wrong
// guesses on the lock screen are also rate-limited (see below). This is
// defense-in-depth (protects against
// something merely reading localStorage, e.g. a browser extension or a
// device backup) rather than a claim of real cryptographic security -
// someone with actual access to unlocked devtools on this device could
// still bypass the gate in-memory, same limitation every client-side
// app-lock has (this is a "away from the phone for a minute" deterrent,
// not encryption).

const STORAGE_KEY = 'confia_app_lock'

const ATTEMPTS_KEY = 'confia_app_lock_attempts'
const PBKDF2_ITERATIONS = 210_000
// After this many wrong PINs in a row the lock screen refuses guesses for a
// while, doubling each further miss (30s, 1m, 2m ... capped at 15 min).
const FREE_ATTEMPTS = 5
const BASE_LOCKOUT_MS = 30_000
const MAX_LOCKOUT_MS = 15 * 60_000

interface StoredLock {
  // 2 = PBKDF2 (this file); absent = the original single-round SHA-256.
  v?: 2
  salt: string
  hash: string
  // Optional: id of a device-bound WebAuthn credential (fingerprint /
  // face / screen-lock) registered via enableBiometric(). The PIN above
  // always stays valid as the fallback.
  credentialId?: string
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hashPinLegacy(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bufferToHex(digest)
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return bufferToHex(bits)
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, salt, hash }))
    localStorage.removeItem(ATTEMPTS_KEY)
  } catch {
    // Storage blocked/full - the caller's UI should already be checking
    // isAppLockEnabled() right after to confirm this actually took, so
    // no separate error path is needed here.
  }
}

interface Attempts {
  fails: number
  lockedUntil: number
}

function readAttempts(): Attempts {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as Attempts) : null
    if (parsed && Number.isFinite(parsed.fails) && Number.isFinite(parsed.lockedUntil)) return parsed
  } catch {
    // unreadable - treat as a clean slate, like every other read here
  }
  return { fails: 0, lockedUntil: 0 }
}

function writeAttempts(a: Attempts): void {
  try {
    if (a.fails === 0) localStorage.removeItem(ATTEMPTS_KEY)
    else localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a))
  } catch {
    // storage unavailable - the lockout then only lasts for this page load
  }
}

/** Milliseconds until PIN guesses are accepted again; 0 when not locked out. */
export function pinLockoutRemainingMs(): number {
  return Math.max(0, readAttempts().lockedUntil - Date.now())
}

/** Call after any successful unlock (PIN or biometric). */
export function resetPinAttempts(): void {
  writeAttempts({ fails: 0, lockedUntil: 0 })
}

function recordFailure(): void {
  const { fails } = readAttempts()
  const next = fails + 1
  const over = next - FREE_ATTEMPTS
  const lockedUntil =
    over >= 0 ? Date.now() + Math.min(BASE_LOCKOUT_MS * 2 ** over, MAX_LOCKOUT_MS) : 0
  writeAttempts({ fails: next, lockedUntil })
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = readStored()
  if (!stored) return false
  // Locked out after repeated misses: don't even evaluate the guess.
  if (pinLockoutRemainingMs() > 0) return false
  const ok =
    stored.v === 2
      ? (await hashPin(pin, stored.salt)) === stored.hash
      : (await hashPinLegacy(pin, stored.salt)) === stored.hash
  if (!ok) {
    recordFailure()
    return false
  }
  resetPinAttempts()
  if (stored.v !== 2) {
    // Upgrade an old single-round hash now that we know the PIN. Same salt
    // is fine; keep the biometric credential if there is one.
    const hash = await hashPin(pin, stored.salt)
    writeStored({ ...stored, v: 2, hash })
  }
  return true
}

function writeStored(lock: StoredLock): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lock))
  } catch {
    // See setAppLockPin - callers re-read state to confirm it took.
  }
}

function toBase64Url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  return bytes.buffer
}

// Biometric unlock uses the browser's WebAuthn "platform authenticator"
// (the phone's own fingerprint/face/screen-lock prompt). It is only a
// LOCAL gate, exactly like the PIN: we ask the device to verify the user
// and take a successful prompt as "yes, it's them". Nothing is sent to a
// server and the biometric data never leaves the OS. Because there's no
// server-side check, this is a convenience layer over the PIN, not a
// stronger one - which is why the PIN remains as the fallback.
export async function isBiometricSupported(): Promise<boolean> {
  try {
    if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function isBiometricEnabled(): boolean {
  return Boolean(readStored()?.credentialId)
}

export async function enableBiometric(): Promise<boolean> {
  const stored = readStored()
  if (!stored) return false
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'MyConfía' },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'app-lock',
          displayName: 'MyConfía app lock',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged',
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    if (!credential) return false
    writeStored({ ...stored, credentialId: toBase64Url(credential.rawId) })
    return isBiometricEnabled()
  } catch {
    // Cancelled by the user, or the device refused - leave the PIN alone.
    return false
  }
}

export async function verifyBiometric(): Promise<boolean> {
  const credentialId = readStored()?.credentialId
  if (!credentialId) return false
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(credentialId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    if (assertion) resetPinAttempts()
    return Boolean(assertion)
  } catch {
    return false
  }
}

export function disableBiometric(): void {
  const stored = readStored()
  if (!stored?.credentialId) return
  const { credentialId: _removed, ...rest } = stored
  void _removed
  writeStored(rest)
}

export function disableAppLock(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(ATTEMPTS_KEY)
  } catch {
    // See setAppLockPin - nothing more to do if storage is unavailable.
  }
}
