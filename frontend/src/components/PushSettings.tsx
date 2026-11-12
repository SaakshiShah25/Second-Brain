import { useEffect, useState } from 'react'
import { Bell, BellRing, Siren } from 'lucide-react'
import {
  currentSubscription,
  deviceTimeZone,
  disableReminders,
  enableReminders,
  getReminderPrefs,
  saveReminderPrefs,
  type ReminderPrefs,
  PermissionDenied,
  pushSupport,
  sendTestReminder,
  serverSupportsPush,
} from '../lib/push'
import { ListGroup, ListRow, Toggle } from './ListGroup'
import { timeLabel } from '../lib/dates'

// Settings > Notifications: turn the 9 AM / 5 PM task reminders on or off for THIS device.
export default function PushSettings() {
  const support = pushSupport()
  const [serverReady, setServerReady] = useState<boolean | null>(null)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const blocked = support === 'ok' && typeof Notification !== 'undefined' && Notification.permission === 'denied'

  useEffect(() => {
    if (support !== 'ok') return
    serverSupportsPush().then(setServerReady)
    currentSubscription().then((sub) => setOn(!!sub && Notification.permission === 'granted'))
  }, [support])

  // This device's summary times and alarm choice, once reminders are on.
  useEffect(() => {
    if (on) void getReminderPrefs().then(setPrefs)
    else setPrefs(null)
  }, [on])

  async function changePrefs(changes: Partial<ReminderPrefs>) {
    const before = prefs
    if (before) setPrefs({ ...before, ...changes }) // shown at once; put back if it can't be saved
    try {
      setPrefs(await saveReminderPrefs(changes))
      setMessage(null)
    } catch (err) {
      setPrefs(before)
      setMessage({ text: err instanceof Error ? err.message : "Couldn't save that - please try again.", tone: 'error' })
    }
  }

  async function testAlarm() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      await sendTestReminder(true)
      setMessage({ text: 'Sent - the alarm should ring in a few seconds.', tone: 'ok' })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Couldn't send a test.", tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

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
        title="Task reminders"
        footer="On iPhone, reminders work once MyConfía is added to your Home Screen: tap Share, then Add to Home Screen, and open it from there."
      >
        <ListRow icon={Bell} iconColor="var(--sb-text-muted)" soft label="Task reminders" detail="Add the app to your Home Screen first" />
      </ListGroup>
    )
  }
  if (support === 'unsupported') {
    return (
      <ListGroup title="Task reminders">
        <ListRow icon={Bell} iconColor="var(--sb-text-muted)" soft label="Task reminders" detail="This browser can't show notifications" />
      </ListGroup>
    )
  }
  if (serverReady === false) return null // the server has no push keys yet - don't offer it

  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default'
  return (
    <>
    {/* Notifications themselves: allow them for this device (also what "Task reminders" below needs). */}
    <ListGroup
      title="Notifications"
      footer={
        permission === 'denied'
          ? 'Blocked. Allow notifications for MyConfía in your browser or phone settings, then come back.'
          : permission === 'default'
            ? 'Your phone will ask once. This also switches on the task reminders below.'
            : undefined
      }
    >
      {permission === 'granted' ? (
        <ListRow icon={BellRing} iconColor="var(--sb-text-muted)" soft label="Notifications" detail="Allowed" />
      ) : (
        <ListRow
          icon={BellRing}
          iconColor="var(--sb-text-muted)"
          soft
          label="Allow notifications"
          detail={permission === 'denied' ? 'Blocked in your browser settings' : 'Tap to allow'}
          chevron={permission !== 'denied'}
          disabled={busy || permission === 'denied'}
          onClick={toggle}
        />
      )}
    </ListGroup>
    <ListGroup
      title="Task reminders"
      footer={
        message ? (
          <span className={message.tone === 'error' ? 'text-danger' : undefined}>{message.text}</span>
        ) : (
          `You get your open tasks grouped by space in a morning and an evening summary (${deviceTimeZone()}) - choose the times below once reminders are on. Nothing is sent when you have none.`
        )
      }
    >
      <ListRow
        icon={BellRing}
        iconColor="var(--sb-text-muted)"
        soft
        label="Task reminders"
        detail={blocked ? 'Blocked in your browser settings' : 'Daily summaries and your own reminders'}
        trailing={<Toggle on={on} onChange={toggle} label="Task reminders" />}
      />
      {on && <ListRow icon={Bell} iconColor="var(--sb-text-muted)" soft label="Send me a test now" chevron onClick={test} disabled={busy} />}
    </ListGroup>
    {on && prefs && (
      <>
        {/* When the summaries arrive: each can be switched off and set to any time. */}
        <ListGroup title="When to remind me" footer="Your open tasks, grouped by space, at these times on this device. Reminders you set on a task go out at the time you chose for it.">
          {([
            { key: 'morning', label: 'Morning summary', on: prefs.morning_on, time: prefs.morning_time },
            { key: 'evening', label: 'Evening summary', on: prefs.evening_on, time: prefs.evening_time },
          ] as const).map((r) => (
            <div key={r.key} className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-base">{r.label}</span>
                <span className="mt-0.5 block text-[0.8125rem] text-text-muted">{r.on ? `Every day at ${timeLabel(r.time)}` : 'Off'}</span>
              </span>
              <input
                type="time"
                aria-label={`${r.label} time`}
                value={r.time}
                disabled={!r.on}
                onChange={(e) => e.target.value && changePrefs({ [`${r.key}_time`]: e.target.value } as Partial<ReminderPrefs>)}
                className="h-10 rounded-xl border border-border-strong bg-bg-card px-2.5 text-[0.9375rem] disabled:opacity-40"
              />
              <Toggle on={r.on} onChange={() => changePrefs({ [`${r.key}_on`]: !r.on } as Partial<ReminderPrefs>)} label={r.label} />
            </div>
          ))}
        </ListGroup>
        <ListGroup
          title="Alarm"
          footer="A reminder you set on a task rings like an alarm: a full-screen card with the task, its priority, details and due date, plus sound and vibration, until you close it. With the app closed, you get a notification that stays until you tap it. (Phones decide the sound; the app can't ring over the lock screen.)"
        >
          <ListRow
            icon={Siren}
            iconColor="var(--sb-text-muted)"
            soft
            label="Alarm-style reminders"
            detail={prefs.alarm_style ? 'On for this device' : 'Off - a normal notification'}
            trailing={<Toggle on={prefs.alarm_style} onChange={() => changePrefs({ alarm_style: !prefs.alarm_style })} label="Alarm-style reminders" />}
          />
          {prefs.alarm_style && <ListRow icon={Bell} iconColor="var(--sb-text-muted)" soft label="Test the alarm" chevron onClick={testAlarm} disabled={busy} />}
        </ListGroup>
      </>
    )}
    </>
  )
}
