import { useEffect, useState } from 'react'
import { Bell, BellRing, Siren } from 'lucide-react'
import { currentSubscription, enableReminders, pushSupport, saveReminderPrefs, serverSupportsPush } from '../lib/push'
import Button from './Button'
import Sheet from './Sheet'

const ASKED_KEY = 'confia.notifPromptAt'
const ASK_AGAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000 // "Not now" is respected for a week

function recentlyAsked(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(ASKED_KEY) || 0) < ASK_AGAIN_AFTER_MS
  } catch {
    return false
  }
}

// On startup: if this device hasn't been asked about notifications yet, ask once, in our own words, before the
// browser's one-shot permission dialog (which can't be shown again once refused). Already allowed but not yet
// switched on for this device (allowed in browser settings) is finished quietly, without asking.
export default function NotificationPrompt() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Step 2, once notifications are allowed: how should reminders arrive - just a notification, or an alarm too?
  const [step, setStep] = useState<'allow' | 'style'>('allow')

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (pushSupport() !== 'ok' || !(await serverSupportsPush())) return
      if (Notification.permission === 'granted') {
        if (!(await currentSubscription())) await enableReminders().catch(() => {})
        return
      }
      if (Notification.permission === 'default' && !recentlyAsked() && !cancelled) setOpen(true)
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  function remember() {
    try {
      localStorage.setItem(ASKED_KEY, String(Date.now()))
    } catch {
      // asked again next time - fine
    }
  }

  async function allow() {
    setBusy(true)
    setError('')
    try {
      await enableReminders() // the browser's own permission dialog appears here
      setStep('style')
    } catch {
      remember()
      setError('Notifications weren’t allowed. You can turn them on any time in Settings.')
    } finally {
      setBusy(false)
    }
  }

  async function chooseStyle(alarm: boolean) {
    setBusy(true)
    try {
      await saveReminderPrefs({ alarm_style: alarm })
    } catch {
      // Not saved (the server may not have the option yet): it stays a normal notification, and Settings can change it.
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  if (!open) return null
  if (step === 'style') {
    return (
      <Sheet onClose={() => setOpen(false)}>
        <div className="flex flex-col items-center px-2 pb-1 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Siren size={24} strokeWidth={2} />
          </span>
          <h3 className="text-lg font-semibold tracking-tight">How should reminders arrive?</h3>
          <p className="mt-1 mb-4 text-[0.9375rem] leading-relaxed text-text-muted">You can change this any time in Settings.</p>
          <Button variant="primary" size="lg" block disabled={busy} onClick={() => chooseStyle(false)}>
            <Bell size={18} strokeWidth={2.2} /> Just a notification
          </Button>
          <Button size="lg" block className="mt-2" disabled={busy} onClick={() => chooseStyle(true)}>
            <Siren size={18} strokeWidth={2.2} /> Notification and alarm
          </Button>
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-text-faint">The alarm also buzzes and rings, with a full-screen card showing the task, until you close it.</p>
        </div>
      </Sheet>
    )
  }
  return (
    <Sheet
      onClose={() => {
        remember()
        setOpen(false)
      }}
    >
      <div className="flex flex-col items-center px-2 pb-1 text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <BellRing size={24} strokeWidth={2} />
        </span>
        <h3 className="text-lg font-semibold tracking-tight">Turn on notifications?</h3>
        <p className="mt-1 mb-4 text-[0.9375rem] leading-relaxed text-text-muted">
          So “remind me” actually reminds you - at the time you pick, and with a morning and evening summary of what’s open.
        </p>
        {error && <p className="mb-3 text-[0.8125rem] text-danger">{error}</p>}
        <Button variant="primary" size="lg" block disabled={busy} onClick={allow}>
          {busy ? 'Asking…' : 'Allow notifications'}
        </Button>
        <Button
          variant="ghost"
          block
          className="mt-1"
          onClick={() => {
            remember()
            setOpen(false)
          }}
        >
          Not now
        </Button>
      </div>
    </Sheet>
  )
}
