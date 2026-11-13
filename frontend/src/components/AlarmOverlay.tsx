import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BellRing, Check, X } from 'lucide-react'
import { useTasks, useUpdateTaskFields, useUpdateTaskStatus } from '../api/tasks'
import type { Task } from '../api/types'
import { startAlarmSound, type AlarmSound } from '../lib/alarmSound'
import { dueLabel } from '../lib/dates'
import { isOverdue } from '../lib/items'
import { PRIORITIES, priorityOf } from '../lib/taskOptions'
import { PriorityMark } from './TaskOptions'
import Button from './Button'

// The alarm: a full-screen card for a reminder that is ringing - the task, its priority, details and due date, with
// sound and vibration until it is closed. It opens when (a) the app is open and a reminder arrives from the server
// (the service worker hands it over), or (b) the person taps the reminder notification (the link carries
// ?alarm=<task ids>, or ?alarm=test for the test button).
interface Alarm {
  ids: number[]
  title: string
  body: string
  test: boolean
}

const SNOOZE_MINUTES = 10

export default function AlarmOverlay() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [alarm, setAlarm] = useState<Alarm | null>(null)
  const [needsTap, setNeedsTap] = useState(false)
  const sound = useRef<AlarmSound | null>(null)
  const wake = useRef<{ release: () => Promise<void> } | null>(null)
  const { data } = useTasks('all', !!alarm)
  const updateFields = useUpdateTaskFields()
  const updateStatus = useUpdateTaskStatus()

  // (a) a reminder pushed while the app is open
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const m = e.data
      if (m && m.type === 'confia-alarm') setAlarm({ ids: Array.isArray(m.ids) ? m.ids : [], title: m.title || '', body: m.body || '', test: !!m.test })
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [])

  // (b) the reminder notification was tapped: /today?alarm=12,15 (or ?alarm=test)
  const fromLink = params.get('alarm')
  useEffect(() => {
    if (!fromLink) return
    const ids = fromLink.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
    setAlarm({ ids, title: '', body: '', test: fromLink === 'test' })
    setParams(
      (prev) => {
        prev.delete('alarm')
        return prev
      },
      { replace: true },
    )
  }, [fromLink, setParams])

  // Ring while it is showing; keep the screen awake.
  useEffect(() => {
    if (!alarm) return
    const s = startAlarmSound()
    sound.current = s
    const check = window.setTimeout(() => setNeedsTap(!s.playing()), 400)
    ;(navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request('screen')
      .then((lock) => (wake.current = lock))
      .catch(() => {})
    return () => {
      window.clearTimeout(check)
      s.stop()
      sound.current = null
      void wake.current?.release().catch(() => {})
      wake.current = null
      setNeedsTap(false)
    }
  }, [alarm])

  const close = useCallback(() => setAlarm(null), [])

  if (!alarm) return null
  const tasks = (alarm.ids.map((id) => data?.tasks.find((t) => t.id === id)).filter(Boolean) as Task[]).filter((t) => t.status === 'open' || alarm.test)

  function snooze(task: Task) {
    const at = new Date(Date.now() + SNOOZE_MINUTES * 60_000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
    updateFields.mutate({ taskId: task.id, fields: { remind_on: date, remind_time: `${pad(at.getHours())}:${pad(at.getMinutes())}`, remind_before: null } })
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Reminder"
      className="fixed inset-0 z-[100] flex flex-col bg-bg text-text"
      // A tap anywhere turns the sound on when the browser held it back (it won't play before the person has touched the page).
      onPointerDown={() => needsTap && (sound.current?.resume(), setNeedsTap(false))}
    >
      <div className="pt-safe pb-safe mx-auto flex w-full max-w-xl flex-1 flex-col overflow-y-auto px-6 py-8">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent" style={{ animation: 'alarm-ring 0.9s ease-in-out infinite' }}>
            <BellRing size={40} strokeWidth={1.8} />
          </span>
          <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">{alarm.test ? 'Alarm test' : 'Reminder'}</h1>
          {needsTap && <p className="mt-2 text-[0.9375rem] text-text-muted">Tap anywhere to turn the sound on</p>}
        </div>

        <div className="mt-8 flex flex-1 flex-col gap-4">
          {tasks.length === 0 && (
            <div className="rounded-2xl border border-border bg-bg-card p-5 text-center">
              <p className="text-lg font-semibold">{alarm.title || (alarm.test ? 'This is how a reminder will ring.' : 'You asked to be reminded.')}</p>
              {alarm.body && <p className="mt-1 text-[0.9375rem] text-text-muted">{alarm.body}</p>}
            </div>
          )}
          {tasks.map((t) => {
            const priority = priorityOf(t)
            const label = PRIORITIES.find((p) => p.value === priority)!.label
            const late = isOverdue(t)
            return (
              <div key={t.id} className="rounded-2xl border border-border bg-bg-card p-5 shadow-card">
                <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-muted">
                  <PriorityMark priority={priority} size={18} /> {label} priority
                </p>
                <p className="mt-2 text-[1.375rem] leading-snug font-semibold">{t.description}</p>
                {t.detail && <p className="mt-2 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-text-muted">{t.detail}</p>}
                <p className={`mt-3 text-[0.9375rem] ${late ? 'font-semibold text-danger' : 'text-text-muted'}`}>
                  {t.due_date ? `${late ? 'Overdue - was due' : 'Due'} ${dueLabel(t.due_date, t.due_time)}` : 'No due date'}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="lg"
                    className="flex-1"
                    onClick={() => {
                      snooze(t)
                      close()
                    }}
                  >
                    Snooze {SNOOZE_MINUTES} min
                  </Button>
                  <Button
                    size="lg"
                    className="flex-1"
                    onClick={() => {
                      updateStatus.mutate({ taskId: t.id, status: 'done', repeats: !!t.repeat })
                      close()
                    }}
                  >
                    <Check size={18} strokeWidth={2.4} /> Done
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button variant="primary" size="lg" block onClick={close}>
            <X size={18} strokeWidth={2.4} /> Close
          </Button>
          {tasks.length > 0 && (
            <Button
              variant="ghost"
              block
              onClick={() => {
                close()
                navigate(`/today?open=${tasks[0].id}`)
              }}
            >
              Open in the app
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
