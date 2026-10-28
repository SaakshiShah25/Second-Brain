import { useEffect, useState } from 'react'
import { Bell, BellRing } from 'lucide-react'
import {
  currentSubscription,
  deviceTimeZone,
  disableReminders,
  enableReminders,
  PermissionDenied,
  pushSupport,
  sendTestReminder,
  serverSupportsPush,
} from '../lib/push'
import { ListGroup, ListRow, Toggle } from './ListGroup'

// Settings > Notifications: turn the 9 AM / 5 PM task reminders on or off for THIS device.
export default function PushSettings() {
  const support = pushSupport()
  const [serverReady, setServerReady] = useState<boolean | null>(null)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const blocked = support === 'ok' && typeof Notification !== 'undefined' && Notification.permission === 'denied'

  useEffect(() => {
    if (support !== 'ok') return
    serverSupportsPush().then(setServerReady)
    currentSubscription().then((sub) => setOn(!!sub && Notification.permission === 'granted'))
  }, [support])

  async function toggle() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      if (on) {
        await disableReminders()
        setOn(false)
      } else {
        await enableReminders()
        setOn(true)
        setMessage({ text: 'Reminders are on for this device.', tone: 'ok' })
      }
    } catch (err) {
      setOn(false)
      setMessage({
        text:
          err instanceof PermissionDenied
            ? 'Notifications are blocked. Allow them for this app in your browser or phone settings, then try again.'
            : err instanceof Error
              ? err.message
              : "Couldn't change reminders - please try again.",
        tone: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      await sendTestReminder()
      setMessage({ text: 'Sent - it should arrive in a few seconds.', tone: 'ok' })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Couldn't send a test.", tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  // Nothing to switch on: say why, instead of showing a toggle that can only fail.
  if (support === 'ios-needs-install') {
    return (
      <ListGroup
        title="Notifications"
        footer="On iPhone, reminders work once MyConfía is added to your Home Screen: tap Share, then Add to Home Screen, and open it from there."
      >
        <ListRow icon={Bell} iconColor="var(--sb-text-muted)" soft label="Task reminders" detail="Add the app to your Home Screen first" />
      </ListGroup>
    )
  }
  if (support === 'unsupported') {
    return (
      <ListGroup title="Notifications">
        <ListRow icon={Bell} iconColor="var(--sb-text-muted)" soft label="Task reminders" detail="This browser can't show notifications" />
      </ListGroup>
    )
  }
  if (serverReady === false) return null // the server has no push keys yet - don't offer it

  return (
    <ListGroup
      title="Notifications"
      footer={
        message ? (
          <span className={message.tone === 'error' ? 'text-danger' : undefined}>{message.text}</span>
        ) : (
          `Twice a day, at 9 AM and 5 PM (${deviceTimeZone()}), you get your open tasks grouped by category. Nothing is sent when you have none.`
        )
      }
    >
      <ListRow
        icon={BellRing}
        iconColor="var(--sb-text-muted)"
        soft
        label="Task reminders"
        detail={blocked ? 'Blocked in your browser settings' : '9 AM and 5 PM, grouped by category'}
        trailing={<Toggle on={on} onChange={toggle} label="Task reminders" />}
      />
      {on && <ListRow icon={Bell} iconColor="var(--sb-text-muted)" soft label="Send me a test now" chevron onClick={test} disabled={busy} />}
    </ListGroup>
  )
}
