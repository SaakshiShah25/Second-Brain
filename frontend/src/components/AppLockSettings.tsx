import { useEffect, useState } from 'react'
import { Fingerprint, ShieldCheck } from 'lucide-react'
import {
  disableAccountLock,
  disableBiometric,
  enableBiometric,
  isAppLockEnabled,
  isBiometricEnabled,
  isBiometricSupported,
  pinLockoutRemainingMs,
  refreshLockStatus,
  setAccountPin,
  type PinResult,
} from '../lib/appLock'
import Button from './Button'
import Card from './Card'
import { Input, Label } from './fields'

// Settings > App lock: set, change or remove the PIN that AppLockGate.tsx
// enforces on resume. The PIN belongs to the ACCOUNT - set it here once and
// every device and browser signed in to this account asks for the same PIN.
// Fingerprint / face unlock is the one part that is per device (it uses this
// device's own secure hardware), so its switch only affects this device.
//
// Kept as its own component (rather than inlined in SettingsPage.tsx) since
// it owns a small multi-step form, unlike every other Settings row which is a
// single toggle or button.
type Mode = 'idle' | 'setting_up' | 'changing' | 'turning_off'

function wait(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

export default function AppLockSettings() {
  const [enabled, setEnabled] = useState(isAppLockEnabled())
  const [mode, setMode] = useState<Mode>('idle')
  const [currentPin, setCurrentPin] = useState('')
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
    // The server is the source of truth: the lock may have been set up or
    // removed on another device since this page last knew.
    refreshLockStatus().then((result) => {
      if (!cancelled && result) setEnabled(result.enabled)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function reset() {
    setMode('idle')
    setCurrentPin('')
    setPin('')
    setConfirmPin('')
    setError('')
  }

  // What to tell the user when the server turned a PIN away.
  function rejection(result: PinResult): string {
    const seconds = result.retry_after > 0 ? result.retry_after : Math.ceil(pinLockoutRemainingMs() / 1000)
    return seconds > 0 ? `Too many wrong PINs. Try again in ${wait(seconds)}.` : 'Incorrect PIN.'
  }

  function failureMessage(err: unknown): string {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('database needs an update')) {
      return "App lock isn't available yet - please try again later."
    }
    return "Couldn't reach MyConfía to save this. Check your connection and try again."
  }

  function validNewPin(): boolean {
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4 to 6 digits.')
      return false
    }
    if (pin !== confirmPin) {
      setError("PINs don't match.")
      return false
    }
    return true
  }

  async function handleSave() {
    if (!validNewPin()) return
    setBusy(true)
    setError('')
    try {
      const result = await setAccountPin(pin, mode === 'changing' ? currentPin : undefined)
      if (!result.ok) {
        setError(rejection(result))
        setCurrentPin('')
        return
      }
      setEnabled(true)
      reset()
    } catch (err) {
      setError(failureMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleTurnOff() {
    setBusy(true)
    setError('')
    try {
      const result = await disableAccountLock(currentPin)
      if (!result.ok) {
        setError(rejection(result))
        setCurrentPin('')
        return
      }
      setEnabled(false)
      setBioEnabled(false)
      reset()
    } catch (err) {
      setError(failureMessage(err))
    } finally {
      setBusy(false)
    }
  }

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

  const pinInputProps = {
    type: 'password' as const,
    inputMode: 'numeric' as const,
    pattern: '[0-9]*',
    maxLength: 6,
  }

  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck size={15} strokeWidth={1.6} className="text-accent" />
        <h2 className="text-sm font-semibold tracking-tight text-text-muted">App lock</h2>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-text-faint">
        Require a PIN to reopen MyConfía - you stay signed in, but it locks every time the app is closed or left in
        the background for a bit. <span className="text-text-muted">The PIN is part of your account: it's the same on
        every device and browser you sign in on.</span> Fingerprint / face unlock is the one thing set up separately on
        each device.
      </p>

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <>
              <Button onClick={() => setMode('changing')}>Change PIN</Button>
              <Button onClick={() => setMode('turning_off')}>Turn off app lock</Button>
            </>
          ) : (
            <Button onClick={() => setMode('setting_up')}>Set up app lock</Button>
          )}
          {enabled && bioSupported && (
            <Button onClick={handleToggleBiometric} disabled={busy}>
              <Fingerprint size={15} strokeWidth={1.6} />
              {bioEnabled ? 'Turn off biometric unlock on this device' : 'Use fingerprint / face on this device'}
            </Button>
          )}
        </div>
      )}
      {mode === 'idle' && enabled && bioSupported && (
        <p className="mt-2 text-xs leading-relaxed text-text-faint">
          {bioEnabled
            ? 'Fingerprint / face unlock is on for this device. Your PIN still works as a fallback.'
            : 'This device supports fingerprint / face unlock. It is switched on per device; the PIN stays as a fallback either way.'}
        </p>
      )}
      {bioMessage && <p className="mt-2 text-xs text-danger">{bioMessage}</p>}

      {(mode === 'setting_up' || mode === 'changing') && (
        <div className="flex flex-col gap-2">
          {mode === 'changing' && (
            <div>
              <Label>Current PIN</Label>
              <Input
                {...pinInputProps}
                autoFocus
                value={currentPin}
                onChange={(e) => {
                  setCurrentPin(e.target.value.replace(/\D/g, ''))
                  setError('')
                }}
              />
            </div>
          )}
          <div>
            <Label>{mode === 'changing' ? 'New PIN (4-6 digits)' : 'New PIN (4-6 digits)'}</Label>
            <Input {...pinInputProps} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <Label>Confirm PIN</Label>
            <Input
              {...pinInputProps}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={busy || (mode === 'changing' && currentPin.length < 4)}
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
            <Button onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'turning_off' && (
        <div className="flex flex-col gap-2">
          <div>
            <Label>Enter your current PIN to turn off app lock on all your devices</Label>
            <Input
              {...pinInputProps}
              autoFocus
              value={currentPin}
              onChange={(e) => {
                setCurrentPin(e.target.value.replace(/\D/g, ''))
                setError('')
              }}
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button variant="danger" onClick={handleTurnOff} disabled={busy || currentPin.length < 4}>
              {busy ? 'Checking…' : 'Turn off'}
            </Button>
            <Button onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
