import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LogOut, ShieldCheck } from 'lucide-react'
import { isAppLockEnabled, verifyPin } from '../lib/appLock'
import { useAuth } from '../auth/AuthContext'
import Button from './Button'
import ConfiaLogo from './ConfiaLogo'

// A device-local re-entry gate for an already-logged-in session - not a
// login screen (Supabase Auth already handled that), just a second,
// local check on RESUMING the app: locks on every fresh app open, and
// again if the app was backgrounded for more than GRACE_MS. Only
// activates at all if the user opted in via Settings > App Lock
// (isAppLockEnabled()) - most users see nothing here, same as
// TermsGate/TourGate render straight through when there's nothing to
// gate.
//
// Renders EITHER the lock screen OR `children`, never both overlaid at
// once (unlike TourGate's dismissible corner card) - the real content
// must not sit in the DOM at all while locked, not just be visually
// covered, since real note/contact data underneath an overlay could
// still be inspected via devtools or briefly flash on mount.
// A quick app-switch (checking a notification, glancing at another app)
// shouldn't force a re-unlock every time - 75s sits in the middle of a
// reasonable 60-90s window: long enough to not be annoying for a brief
// switch away, short enough that leaving the phone unattended for real
// still locks it back up promptly.
const GRACE_MS = 75_000

export default function AppLockGate({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const enabled = isAppLockEnabled()
  // Locked by default whenever a PIN is configured - this is what makes
  // every fresh app open (cold start, not just backgrounding) require
  // re-entry: this state is plain in-memory React state, reset from
  // scratch every time this component mounts, which happens once per
  // app session at the root of the authenticated route tree.
  const [locked, setLocked] = useState(enabled)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
  const hiddenAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    function handleVisibilityChange() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
        return
      }
      const hiddenAt = hiddenAtRef.current
      hiddenAtRef.current = null
      if (hiddenAt !== null && Date.now() - hiddenAt > GRACE_MS) {
        setLocked(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [enabled])

  if (!enabled || !locked) {
    return <>{children}</>
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setChecking(true)
    const ok = await verifyPin(pin)
    setChecking(false)
    if (ok) {
      setLocked(false)
      setPin('')
      setError(false)
    } else {
      setError(true)
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
        Enter your PIN to continue
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
            setError(false)
          }}
          className="w-full rounded-lg border border-border-strong bg-bg-card px-4 py-3 text-center text-2xl tracking-[0.5em] text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="••••"
        />
        {error && <p className="text-xs text-danger">Incorrect PIN - try again.</p>}
        <Button type="submit" variant="primary" className="w-full justify-center" disabled={pin.length < 4 || checking}>
          {checking ? 'Checking…' : 'Unlock'}
        </Button>
      </form>
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
