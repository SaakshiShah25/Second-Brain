import { useState } from 'react'
import { Lock } from 'lucide-react'
import { disableAppLock, isAppLockEnabled, setAppLockPin, verifyPin } from '../lib/appLock'
import Button from './Button'
import { Input, Label } from './fields'
import { ListGroup, ListRow, Toggle } from './ListGroup'
import Sheet from './Sheet'

// Settings > App Lock: set up or remove the local PIN gate AppLockGate.tsx
// enforces on resume. Kept as its own component (rather than inlined in
// SettingsPage.tsx) since it owns a small multi-step form (enter PIN,
// confirm PIN / verify current PIN before turning off) - shown in a
// bottom sheet off the row's toggle, unlike every other Settings row.
type Mode = 'idle' | 'setting_up' | 'turning_off'

export default function AppLockSettings() {
  const [enabled, setEnabled] = useState(isAppLockEnabled())
  const [mode, setMode] = useState<Mode>('idle')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
      setError('Incorrect PIN.')
      setPin('')
      return
    }
    disableAppLock()
    setEnabled(false)
    reset()
  }

  return (
    <>
      <ListGroup
        title="Security"
        footer="Require a PIN to reopen MyConfía on this device. Re-locks whenever the app is closed or left in the background for a bit. Set per device."
      >
        <ListRow
          icon={Lock}
          iconColor="#78716c"
          label="App lock"
          trailing={
            <Toggle on={enabled} onChange={() => setMode(enabled ? 'turning_off' : 'setting_up')} label="App lock" />
          }
        />
      </ListGroup>

      {mode === 'setting_up' && (
        <Sheet onClose={busy ? undefined : reset} title="Set up app lock">
          <div className="flex flex-col gap-3">
            <div>
              <Label>New PIN (4–6 digits)</Label>
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                className="text-center text-xl tracking-[0.4em]"
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
                className="text-center text-xl tracking-[0.4em]"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button variant="primary" size="lg" block onClick={handleSetUp} disabled={busy}>
              {busy ? 'Saving…' : 'Turn on app lock'}
            </Button>
            <Button variant="ghost" size="lg" block onClick={reset}>
              Cancel
            </Button>
          </div>
        </Sheet>
      )}

      {mode === 'turning_off' && (
        <Sheet onClose={busy ? undefined : reset} title="Turn off app lock">
          <div className="flex flex-col gap-3">
            <div>
              <Label>Enter your current PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                className="text-center text-xl tracking-[0.4em]"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, ''))
                  setError('')
                }}
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button variant="danger" size="lg" block onClick={handleTurnOff} disabled={busy || pin.length < 4}>
              {busy ? 'Checking…' : 'Turn off'}
            </Button>
            <Button variant="ghost" size="lg" block onClick={reset}>
              Cancel
            </Button>
          </div>
        </Sheet>
      )}
    </>
  )
}
