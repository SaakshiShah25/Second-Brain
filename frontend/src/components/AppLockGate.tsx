import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Fingerprint, LogOut, ShieldCheck } from 'lucide-react'
import {
  isAppLockEnabled,
  isBiometricEnabled,
  pinLockoutRemainingMs,
  refreshLockStatus,
  setAppLockUser,
  unlockWithPin,
  verifyBiometric,
} from '../lib/appLock'
import { useAuth } from '../auth/AuthContext'
import Button from './Button'
import ConfiaLogo from './ConfiaLogo'

// A re-entry gate for an already-logged-in session - not a login screen
// (Supabase Auth already handled that), just a second check on RESUMING the
// app: locks on every fresh app open, and again if the app was backgrounded
// for more than GRACE_MS. Only active if the account has an app lock (set in
// Settings > App lock) - most users see nothing here, same as TermsGate/
// TourGate render straight through when there's nothing to gate.
//
// The PIN is the ACCOUNT's, so it is the same on every device. This device
// learns whether a lock exists from the server (refreshLockStatus) - on a
// cold start it already knows from its own cache and locks instantly, and a
// device that has never heard of the lock (just signed in, or the lock was
// set up elsewhere) is locked as soon as the server answers.
//
// Renders EITHER the lock screen OR `children`, never both overlaid at once
// - the real content must not sit in the DOM at all while locked, not just
// be visually covered, since real note/contact data underneath an overlay
// could still be inspected via devtools or briefly flash on mount.
// A quick app-switch (checking a notification, glancing at another app)
// shouldn't force a re-unlock every time - 75s sits in the middle of a
// reasonable 60-90s window: long enough to not be annoying for a brief
// switch away, short enough that leaving the phone unattended for real
// still locks it back up promptly.
const GRACE_MS = 75_000

function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

export default function AppLockGate({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  // Whose lock this is - read synchronously, before the first render uses it.
  setAppLockUser(user?.id ?? null)

  const [enabled, setEnabled] = useState(() => isAppLockEnabled())
  // Locked by default whenever a lock is known - this is what makes every
  // fresh app open (cold start, not just backgrounding) require re-entry:
  // plain in-memory React state, reset every time this component mounts,
  // which happens once per app session at the root of the authenticated tree.
  const [locked, setLocked] = useState(enabled)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  // Wrong-PIN wait (the server's, or this device's when offline): re-read each
  // second so the message counts down and the form re-enables by itself.
  const [lockoutMs, setLockoutMs] = useState(() => pinLockoutRemainingMs())
  const hiddenAtRef = useRef<number | null>(null)
  const enabledRef = useRef(enabled) // the latest `enabled`, for use inside async callbacks
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])
  // One automatic biometric prompt per lock event - after that (cancelled
  // or failed) the user uses the button or the PIN, so we never loop
  // prompts at them.
  const autoTriedRef = useRef(false)
  const biometric = enabled && isBiometricEnabled()

  // Asks the server whether this account has a lock and adjusts to the answer:
  // a lock that appeared (set up on another device) locks this one too, and a
  // lock turned off elsewhere opens it.
  async function syncWithServer() {
    const result = await refreshLockStatus()
    if (!result) return // couldn't ask - keep whatever this device already knew
    const nowEnabled = result.enabled || isAppLockEnabled()
    if (!enabledRef.current && nowEnabled) setLocked(true)
    enabledRef.current = nowEnabled
    setEnabled(nowEnabled)
    if (!nowEnabled) setLocked(false)
  }

  useEffect(() => {
    void syncWithServer()
    // once per session; later checks run when the app comes back into view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function tryBiometric() {
    setChecking(true)
    const ok = await verifyBiometric()
    setChecking(false)
    if (ok) {
      setLocked(false)
      setPin('')
      setError(null)
      setLockoutMs(0)
    }
  }

  useEffect(() => {
    if (!locked) {
      autoTriedRef.current = false
      return
    }
    if (biometric && !autoTriedRef.current) {
      autoTriedRef.current = true
      void tryBiometric()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, biometric])

  useEffect(() => {
    if (lockoutMs <= 0) return
    const id = window.setInterval(() => setLockoutMs(pinLockoutRemainingMs()), 1000)
    return () => window.clearInterval(id)
  }, [lockoutMs])

  // Re-lock after a long enough time away, and check the server again each time
  // the app comes back into view (always - not only when a lock is known - so a
  // lock set up on another device reaches this one).
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
        return
      }
      const hiddenAt = hiddenAtRef.current
      hiddenAtRef.current = null
      if (enabled && hiddenAt !== null && Date.now() - hiddenAt > GRACE_MS) {
        setLocked(true)
      }
      void syncWithServer()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  if (!enabled || !locked) {
    return <>{children}</>
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pinLockoutRemainingMs() > 0) {
      setLockoutMs(pinLockoutRemainingMs())
      return
    }
    setChecking(true)
    const result = await unlockWithPin(pin)
    setChecking(false)
    setLockoutMs(pinLockoutRemainingMs())
    if (result.ok) {
      // A lock that turned out to be off (removed on another device) leaves
      // nothing to guard from here on.
      if (!isAppLockEnabled()) setEnabled(false)
      setLocked(false)
      setPin('')
      setError(null)
    } else {
      setError(
        result.needsConnection
          ? "Can't check your PIN without a connection yet. Connect to the internet, or use your fingerprint."
          : 'Incorrect PIN - try again.',
      )
      setPin('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-6">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-text">
        <ConfiaLogo size={22} />
      </div>
      <h1 className="mb-1 text-lg font-semibold tracking-tight text-text">MyConfía is locked</h1>
      <p className="mb-6 flex items-center gap-1 text-sm text-text-muted">
        <ShieldCheck size={14} strokeWidth={1.6} />
        {biometric ? 'Use your fingerprint / face, or enter your PIN' : 'Enter your PIN to continue'}
      </p>
      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col items-center gap-3">
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoFocus
          maxLength={6}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ''))
            setError(null)
          }}
          className="w-full rounded-lg border border-border-strong bg-bg-card px-4 py-3 text-center text-2xl tracking-[0.5em] text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="••••"
        />
        {lockoutMs > 0 ? (
          <p className="text-center text-xs text-danger" role="alert">
            Too many wrong PINs. Try again in {formatWait(lockoutMs)}.
          </p>
        ) : (
          error && (
            <p className="text-center text-xs text-danger" role="alert">
              {error}
            </p>
          )
        )}
        <Button
          type="submit"
          variant="primary"
          className="w-full justify-center"
          disabled={pin.length < 4 || checking || lockoutMs > 0}
        >
          {checking ? 'Checking…' : 'Unlock'}
        </Button>
      </form>
      {biometric && (
        <button
          type="button"
          onClick={() => void tryBiometric()}
          disabled={checking}
          className="mt-4 flex items-center gap-1.5 text-sm font-medium text-accent hover:underline disabled:opacity-50"
        >
          <Fingerprint size={16} strokeWidth={1.6} />
          Unlock with fingerprint / face
        </button>
      )}
      <button
        type="button"
        onClick={() => signOut()}
        className="mt-8 flex items-center gap-1.5 text-xs text-text-faint hover:text-danger"
      >
        <LogOut size={13} strokeWidth={1.6} />
        Not you? Sign out instead
      </button>
    </div>
  )
}
