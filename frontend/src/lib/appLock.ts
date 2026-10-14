// appLock.ts - the app-lock PIN, as seen from this device.
//
// The PIN belongs to the ACCOUNT: it is set once and every device and
// browser signed in to that account asks for the same one. The server
// (api/routers/app_lock.py, app_lock.py) holds the real record and checks
// guesses itself, counting wrong ones per account - so the lockout can't be
// reset by clearing this browser's storage.
//
// What lives HERE, in localStorage and keyed by user id so one account's
// lock never applies to another account signed in on the same browser:
//   * a cached copy of a PIN verifier (PBKDF2 of the PIN, made on this
//     device after a successful unlock) - only so the lock screen still works
//     with no connection, when the server can't be asked;
//   * whether the server is known to have a lock for this account;
//   * the wrong-guess counter for offline guessing;
//   * the id of this device's own biometric (WebAuthn) credential. That one
//     can never be shared between devices - it is bound to the device's
//     secure hardware - so biometric unlock is switched on per device even
//     though the PIN is per account.
//
// It remains what it always was: a lock for an app that is already signed
// in, to stop someone who picks up an unlocked phone for a minute. Signing
// in (Supabase Auth) is the real login, and notes are protected by
// encryption. Someone with devtools open on an unlocked device could still
// bypass the screen in memory - same limit as every client-side app lock.

import {
  ApiError,
  api,
} from '../api/client'

const LEGACY_KEY = 'confia_app_lock' // before the PIN became per-account: one record per browser
const LEGACY_ATTEMPTS_KEY = 'confia_app_lock_attempts'
const PBKDF2_ITERATIONS = 210_000
// Offline guessing: after this many wrong PINs in a row the lock screen
// refuses guesses for a while, doubling each miss (30s, 1m ... 15 min). Online
// guesses are limited by the server with the same schedule.
const FREE_ATTEMPTS = 5
const BASE_LOCKOUT_MS = 30_000
const MAX_LOCKOUT_MS = 15 * 60_000

// ---------- Which account's lock this is ----------

let activeUser: string | null = null

const lockKey = () => `confia_app_lock:${activeUser ?? ''}`
const attemptsKey = () => `confia_app_lock_attempts:${activeUser ?? ''}`
const remoteKey = () => `confia_app_lock_remote:${activeUser ?? ''}`

/** Tells this module whose lock to read. Called by AppLockGate as soon as the
 * signed-in user is known. A browser-wide lock from the old per-device
 * version is adopted by the first account that opens the app, then removed
 * (the PIN it holds is moved onto the account the next time it is typed). */
export function setAppLockUser(userId: string | null): void {
  if (userId === activeUser) return
  activeUser = userId
  if (!userId) return
  try {
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy && !localStorage.getItem(lockKey())) {
      localStorage.setItem(lockKey(), legacy)
      const legacyAttempts = localStorage.getItem(LEGACY_ATTEMPTS_KEY)
      if (legacyAttempts) localStorage.setItem(attemptsKey(), legacyAttempts)
    }
    localStorage.removeItem(LEGACY_KEY)
    localStorage.removeItem(LEGACY_ATTEMPTS_KEY)
  } catch {
    // storage blocked - nothing to migrate
  }
}

// ---------- Local storage helpers ----------

interface StoredLock {
  // 2 = PBKDF2 (below); absent = the original single-round SHA-256.
  v?: 2
  salt: string
  hash: string
  // Id of this device's WebAuthn credential (fingerprint / face / screen
  // lock), if biometric unlock has been switched on here.
  credentialId?: string
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hashPinLegacy(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  return bufferToHex(await crypto.subtle.digest('SHA-256', data))
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
    const raw = localStorage.getItem(lockKey())
    return raw ? (JSON.parse(raw) as StoredLock) : null
  } catch {
    // Blocked storage or corrupted JSON: treat as "no cached verifier" rather
    // than throwing, same fail-quiet contract as every localStorage read here.
    return null
  }
}

function writeStored(lock: StoredLock): void {
  try {
    localStorage.setItem(lockKey(), JSON.stringify(lock))
  } catch {
    // Storage blocked/full - the lock just won't work offline on this device.
  }
}

function remoteKnown(): boolean {
  try {
    return localStorage.getItem(remoteKey()) === '1'
  } catch {
    return false
  }
}

function setRemoteKnown(on: boolean): void {
  try {
    if (on) localStorage.setItem(remoteKey(), '1')
    else localStorage.removeItem(remoteKey())
  } catch {
    // see writeStored
  }
}

/** Remembers a PIN on this device (as a verifier) after the server accepted it
 * or it was set - keeping this device's biometric credential if it has one. */
async function cacheVerifier(pin: string): Promise<void> {
  const salt = bufferToHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  const hash = await hashPin(pin, salt)
  const existing = readStored()
  writeStored({ ...(existing?.credentialId ? { credentialId: existing.credentialId } : {}), v: 2, salt, hash })
  setRemoteKnown(true)
}

/** Forgets everything about the lock on this device (verifier, biometric,
 * counters). Used when the lock is turned off here or on another device. */
export function clearLocalLock(): void {
  try {
    localStorage.removeItem(lockKey())
    localStorage.removeItem(attemptsKey())
    localStorage.removeItem(remoteKey())
  } catch {
    // see writeStored
  }
}

/** True when this device already knows the account has an app lock - so the
 * lock screen can show instantly on a cold start, before any network call. */
export function isAppLockEnabled(): boolean {
  return readStored() !== null || remoteKnown()
}

// ---------- Wrong-guess counter (offline guessing, and showing the server's wait) ----------

interface Attempts {
  fails: number
  lockedUntil: number
}

function readAttempts(): Attempts {
  try {
    const raw = localStorage.getItem(attemptsKey())
    const parsed = raw ? (JSON.parse(raw) as Attempts) : null
    if (parsed && Number.isFinite(parsed.fails) && Number.isFinite(parsed.lockedUntil)) return parsed
  } catch {
    // unreadable - treat as a clean slate
  }
  return { fails: 0, lockedUntil: 0 }
}

function writeAttempts(a: Attempts): void {
  try {
    if (a.fails === 0) localStorage.removeItem(attemptsKey())
    else localStorage.setItem(attemptsKey(), JSON.stringify(a))
  } catch {
    // storage unavailable - the wait then only lasts for this page load
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

function recordLocalFailure(): void {
  const next = readAttempts().fails + 1
  const over = next - FREE_ATTEMPTS
  const lockedUntil = over >= 0 ? Date.now() + Math.min(BASE_LOCKOUT_MS * 2 ** over, MAX_LOCKOUT_MS) : 0
  writeAttempts({ fails: next, lockedUntil })
}

/** Shows the server's lockout on this device too (it said "wait N seconds"). */
function applyServerLockout(retryAfterSeconds: number): void {
  if (retryAfterSeconds > 0) {
    writeAttempts({ fails: FREE_ATTEMPTS, lockedUntil: Date.now() + retryAfterSeconds * 1000 })
  }
}

// ---------- Talking to the server ----------

export interface PinResult {
  enabled: boolean
  ok: boolean
  retry_after: number
}

/** Asks the server whether this account has an app lock, and reconciles this
 * device with the answer. Returns null if the server couldn't be reached.
 *   - lock on: remembered (so the next cold start locks instantly);
 *   - lock off, and we had seen it on: it was turned off on another device,
 *     so this device's copy is removed too;
 *   - lock off, but this device has an OLD per-device PIN we never saw on
 *     the server: left alone - it moves onto the account when typed. */
export async function refreshLockStatus(): Promise<{ enabled: boolean } | null> {
  try {
    const { enabled } = await api.get<{ enabled: boolean }>('/api/app-lock')
    if (enabled) {
      setRemoteKnown(true)
    } else if (remoteKnown()) {
      clearLocalLock()
    }
    return { enabled }
  } catch {
    return null
  }
}

// ---------- Unlocking ----------

export interface UnlockResult {
  ok: boolean
  /** A wrong PIN led to (or hit) a wait - seconds. */
  retryAfter: number
  /** No cached copy on this device and no connection: the PIN can't be
   * checked yet (fingerprint, if set up, still works). */
  needsConnection?: boolean
}

async function verifyLocal(pin: string): Promise<boolean> {
  const stored = readStored()
  if (!stored) return false
  if (pinLockoutRemainingMs() > 0) return false
  const ok =
    stored.v === 2
      ? (await hashPin(pin, stored.salt)) === stored.hash
      : (await hashPinLegacy(pin, stored.salt)) === stored.hash
  if (!ok) {
    recordLocalFailure()
    return false
  }
  resetPinAttempts()
  if (stored.v !== 2) await cacheVerifier(pin) // upgrade an old single-round hash
  return true
}

/** Checks a PIN. Online, the SERVER decides (so its lockout counts); offline
 * - or if the server can't be reached - the copy cached on this device does. */
export async function unlockWithPin(pin: string): Promise<UnlockResult> {
  if (navigator.onLine) {
    try {
      const res = await api.post<PinResult>('/api/app-lock/verify', { pin })
      if (res.enabled && res.ok) {
        await cacheVerifier(pin)
        resetPinAttempts()
        return { ok: true, retryAfter: 0 }
      }
      if (res.enabled) {
        applyServerLockout(res.retry_after)
        return { ok: false, retryAfter: res.retry_after }
      }
      // The server has no lock for this account.
      if (remoteKnown()) {
        // This device had seen the lock on the server, so it was turned off
        // somewhere else (possibly before this device heard about it). Don't
        // bring it back from the stale local copy.
        clearLocalLock()
        return { ok: true, retryAfter: 0 }
      }
      if (readStored()) {
        // An old per-device PIN: if they typed it right, it becomes the
        // account's PIN now, so every other device asks for it too.
        if (await verifyLocal(pin)) {
          try {
            const adopted = await api.put<PinResult>('/api/app-lock', { pin })
            if (adopted.ok) setRemoteKnown(true)
          } catch {
            // Couldn't move it onto the account just now; it works locally,
            // and will be tried again next unlock.
          }
          return { ok: true, retryAfter: 0 }
        }
        return { ok: false, retryAfter: Math.ceil(pinLockoutRemainingMs() / 1000) }
      }
      // No lock anywhere (turned off elsewhere): nothing to unlock.
      clearLocalLock()
      return { ok: true, retryAfter: 0 }
    } catch (err) {
      // 401 etc. are real answers; anything else (no route to the server, a
      // timeout, a 5xx) falls through to the local copy below.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        return { ok: false, retryAfter: 0 }
      }
    }
  }
  if (!readStored()) return { ok: false, retryAfter: 0, needsConnection: true }
  const ok = await verifyLocal(pin)
  return { ok, retryAfter: ok ? 0 : Math.ceil(pinLockoutRemainingMs() / 1000) }
}

// ---------- Setting, changing and removing the PIN (Settings) ----------

/** Sets the account's PIN, or changes it (then `currentPin` is required).
 * Rejects if the server can't be reached - the PIN has to reach the account,
 * or it would exist on this device only. */
export async function setAccountPin(pin: string, currentPin?: string): Promise<PinResult> {
  const res = await api.put<PinResult>('/api/app-lock', { pin, current_pin: currentPin })
  if (res.ok) {
    await cacheVerifier(pin)
    resetPinAttempts()
  } else {
    applyServerLockout(res.retry_after)
  }
  return res
}

/** Turns the lock off for the whole account (needs the current PIN). */
export async function disableAccountLock(pin: string): Promise<PinResult> {
  const res = await api.post<PinResult>('/api/app-lock/disable', { pin })
  if (res.ok) clearLocalLock()
  else applyServerLockout(res.retry_after)
  return res
}

// ---------- Biometric unlock (per device) ----------

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

// Biometric unlock uses the browser's WebAuthn "platform authenticator" (the
// phone's or laptop's own fingerprint/face/screen-lock prompt). It is only a
// LOCAL gate, like the PIN screen: we ask the device to verify the user and
// take a successful prompt as "yes, it's them". The biometric data never
// leaves the OS, and the credential can't leave the device - so this one is
// switched on separately on each device, while the PIN is shared by the
// account. The PIN remains as the fallback.
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
