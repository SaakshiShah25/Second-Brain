import { useEffect, useState } from 'react'
import { Fingerprint, ShieldCheck } from 'lucide-react'
import {
  disableAppLock,
  disableBiometric,
  enableBiometric,
  isAppLockEnabled,
  isBiometricEnabled,
  isBiometricSupported,
  pinLockoutRemainingMs,
  setAppLockPin,
  verifyPin,
} from '../lib/appLock'
import Button from './Button'
import Card from './Card'
import { Input, Label } from './fields'

// Settings > App Lock: set up or remove the local PIN gate AppLockGate.tsx
// enforces on resume. Kept as its own component (rather than inlined in
// SettingsPage.tsx) since it owns a small multi-step form (enter PIN,
// confirm PIN / verify current PIN before turning off), unlike every
// other Settings row which is a single toggle or button.
type Mode = 'idle' | 'setting_up' | 'turning_off'

export default function AppLockSettings() {
  const [enabled, setEnabled] = useState(isAppLockEnabled())
  const [mode, setMode] = useState<Mode>('idle')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [bioSupported, setBioSupported] = useState(false)
  const [bioEnabled, setBioEnabled] = useState(isBiometricEnabled())
  const [bioMessage, setBioMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    isBiometricSupported().then((ok) => {
      if (!cancelled) setBioSupported(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleToggleBiometric() {
    setBioMessage('')
    if (bioEnabled) {
      disableBiometric()
      setBioEnabled(false)
      return
    }
    setBusy(true)
    const ok = await enableBiometric()
    setBusy(false)
    setBioEnabled(ok)
    if (!ok) setBioMessage("Couldn't turn on biometric unlock. Your PIN still works.")
  }

  function reset() {
    setMode('idle')
    setPin('')
    setConfirmPin('')
    setError('')
  }

  async function handleSetUp() {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits.')
      return
    }
    if (pin !== confirmPin) {
      setError("PINs don't match.")
      return
    }
    setBusy(true)
    await setAppLockPin(pin)
    setBusy(false)
    setEnabled(true)
    reset()
  }

  async function handleTurnOff() {
    setBusy(true)
    const ok = await verifyPin(pin)
    setBusy(false)
    if (!ok) {
      const wait = pinLockoutRemainingMs()
      setError(wait > 0 ? `Too many wrong PINs. Try again in ${Math.ceil(wait / 1000)}s.` : 'Incorrect PIN.')
      setPin('')
      return
    }
    disableAppLock()
    setEnabled(false)
    setBioEnabled(false)
    reset()
  }

  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck size={15} strokeWidth={1.6} className="text-accent" />
        <h2 className="text-sm font-semibold tracking-tight text-text-muted">App lock</h2>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-text-faint">
        Require a PIN to reopen MyConfía on this device - stays signed in, but re-locks every time the app is
        closed or left in the background for a bit. Set separately per device; it isn't tied to your account.
      </p>

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMode(enabled ? 'turning_off' : 'setting_up')}>
            {enabled ? 'Turn off app lock' : 'Set up app lock'}
          </Button>
          {enabled && bioSupported && (
            <Button onClick={handleToggleBiometric} disabled={busy}>
              <Fingerprint size={15} strokeWidth={1.6} />
              {bioEnabled ? 'Turn off biometric unlock' : 'Use fingerprint / face to unlock'}
            </Button>
          )}
        </div>
      )}
      {mode === 'idle' && enabled && bioSupported && (
        <p className="mt-2 text-xs leading-relaxed text-text-faint">
          {bioEnabled
            ? 'Fingerprint / face unlock is on. Your PIN still works as a fallback.'
            : 'Your device supports fingerprint / face unlock. The PIN stays as a fallback either way.'}
        </p>
      )}
      {bioMessage && <p className="mt-2 text-xs text-danger">{bioMessage}</p>}

      {mode === 'setting_up' && (
        <div className="flex flex-col gap-2">
          <div>
            <Label>New PIN (4-6 digits)</Label>
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div>
            <Label>Confirm PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button variant="primary" onClick={handleSetUp} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            <Button onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}

      {mode === 'turning_off' && (
        <div className="flex flex-col gap-2">
          <div>
            <Label>Enter your current PIN to turn off app lock</Label>
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''))
                setError('')
              }}
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button variant="danger" onClick={handleTurnOff} disabled={busy || pin.length < 4}>
              {busy ? 'Checking…' : 'Turn off'}
            </Button>
            <Button onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
