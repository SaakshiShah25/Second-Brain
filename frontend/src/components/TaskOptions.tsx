import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BellOff } from 'lucide-react'
import type { Task } from '../api/types'
import { isoLocal, shortDate, timeLabel } from '../lib/dates'
import { DEFAULT_REMIND_TIME, ON_PRIORITY, PRIORITIES, earliestReminderDate, momentPassed, priorityOf, reminderChoices, tint, type Priority } from '../lib/taskOptions'
import Button from './Button'
import Sheet from './Sheet'
import { Input } from './fields'

// The priority mark: a round-edged pill of exclamation marks - ! low, !! normal, !!! high - in the level's colour
// (green, amber, red). It matches the app's rounded look (the checkbox ring and the bell) and needs no explaining.
const MARKS: Record<Priority, string> = { high: '!!!', normal: '!!', low: '!' }
export function PriorityBars({ priority, inverted = false, filled = false }: { priority: Priority; inverted?: boolean; filled?: boolean }) {
  const color = PRIORITIES.find((p) => p.value === priority)!.color
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-6 min-w-[2.125rem] items-center justify-center rounded-full px-2 text-[0.8125rem] leading-none font-extrabold tracking-tight"
      style={
        inverted || filled
          ? { backgroundColor: color, color: ON_PRIORITY }
          : { backgroundColor: tint(color, 16), color }
      }
    >
      {MARKS[priority]}
    </span>
  )
}

// The priority of a task. Tap it to choose: three labelled options in a small panel that floats above everything
// (it is drawn outside the task card, so the card can't clip it).
export function PriorityFlag({ priority, onPick }: { priority: Priority; onPick: (p: Priority) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const current = PRIORITIES.find((p) => p.value === priority)!
  const PANEL_HEIGHT = 52
  const below = anchor ? anchor.bottom + 8 + PANEL_HEIGHT < window.innerHeight : true
  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
        aria-label={`Priority: ${current.label}. Change`}
        aria-expanded={!!anchor}
        title={`Priority: ${current.label}`}
        className="pressable -m-1 flex h-9 min-w-9 items-center justify-center rounded-full"
      >
        <PriorityBars priority={priority} />
      </button>
      {anchor &&
        createPortal(
          <>
            <button type="button" aria-label="Close" className="fixed inset-0 z-[60] cursor-default" onClick={() => setAnchor(null)} />
            <div
              role="menu"
              className="fixed z-[61] flex gap-1 rounded-full border border-border-strong bg-bg-card p-1 shadow-card"
              style={{
                right: Math.max(8, window.innerWidth - anchor.right - 8),
                ...(below ? { top: anchor.bottom + 8 } : { bottom: window.innerHeight - anchor.top + 8 }),
                animation: 'fade-in 0.15s ease-out',
              }}
            >
              {PRIORITIES.map((p) => {
                const active = priority === p.value
                return (
                  <button
                    key={p.value}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAnchor(null)
                      onPick(p.value)
                    }}
                    className="pressable flex h-10 items-center gap-1 rounded-full border pr-3 pl-1.5 text-[0.8125rem] font-semibold"
                    style={
                      active
                        ? { backgroundColor: p.color, borderColor: p.color, color: ON_PRIORITY }
                        : { borderColor: tint(p.color, 45), color: p.color }
                    }
                  >
                    <PriorityBars priority={p.value} inverted={active} />
                    {p.label}
                  </button>
                )
              })}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

// "Remind me" for one task: a time of day (9 AM unless changed), then quick choices counted from its due date, "at its due
// time" when it has one, or any date.
export function ReminderSheet({
  task,
  onPick,
  onClose,
}: {
  task: Task
  onPick: (date: string | null, time: string | null) => void
  onClose: () => void
}) {
  const [time, setTime] = useState((task.remind_time ?? DEFAULT_REMIND_TIME).slice(0, 5))
  const choices = reminderChoices(task.due_date)
  const [custom, setCustom] = useState('')
  const today = isoLocal(new Date())
  const earliest = earliestReminderDate(new Date(), time || DEFAULT_REMIND_TIME)
  const dueTime = task.due_date && task.due_time ? task.due_time.slice(0, 5) : null
  // Stored as null when it is the default, so a plain 9 AM reminder stays exactly what it always was.
  const pick = (date: string, at: string) => {
    onPick(date, at === DEFAULT_REMIND_TIME ? null : at)
    onClose()
  }
  const gone = (date: string, at: string) => momentPassed(date, at)
  return (
    <Sheet onClose={onClose}>
      <h3 className="text-lg font-semibold tracking-tight">Remind me</h3>
      <p className="mb-4 mt-0.5 line-clamp-2 text-[0.9375rem] text-text-muted">{task.description}</p>
      {task.remind_on && (
        <p className="mb-3 rounded-xl bg-bg-elevated px-3.5 py-2.5 text-[0.9375rem]">
          Reminder set for <span className="font-semibold">{shortDate(task.remind_on)}</span>,{' '}
          {timeLabel((task.remind_time ?? DEFAULT_REMIND_TIME).slice(0, 5))}
        </p>
      )}
      {dueTime && task.due_date && (
        <button
          type="button"
          disabled={gone(task.due_date, dueTime)}
          onClick={() => pick(task.due_date!, dueTime)}
          className="pressable mb-3 flex h-11 w-full items-center justify-between rounded-2xl border border-border-strong bg-bg-card px-3.5 text-left disabled:opacity-40"
        >
          <span className="text-[0.9375rem] font-medium">At its due time</span>
          <span className="text-[0.8125rem] text-text-muted">
            {shortDate(task.due_date)}, {timeLabel(dueTime)}
          </span>
        </button>
      )}
      <div className="mb-3 flex items-center gap-3">
        <label htmlFor="remind-time" className="text-[0.9375rem] text-text-muted">
          At
        </label>
        <Input id="remind-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-36" />
      </div>
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => {
          const past = !time || gone(c.date, time)
          return (
            <button
              key={c.label}
              type="button"
              disabled={past}
              onClick={() => pick(c.date, time)}
              className="pressable flex h-10 flex-col items-start justify-center rounded-2xl border border-border-strong bg-bg-card px-3.5 text-left leading-tight disabled:opacity-40"
            >
              <span className="text-[0.875rem] font-medium">{c.label}</span>
              <span className="text-[0.75rem] text-text-muted">{shortDate(c.date)}</span>
            </button>
          )
        })}
        {choices.length === 0 && <p className="text-[0.875rem] text-text-muted">The usual choices have already passed - pick a date below.</p>}
      </div>
      <div className="mt-4 flex gap-2">
        <Input type="date" min={earliest} value={custom} onChange={(e) => setCustom(e.target.value)} className="flex-1" />
        <Button variant="primary" disabled={!custom || !time || gone(custom, time)} onClick={() => pick(custom, time)}>
          Set
        </Button>
      </div>
      <p className="mt-2 text-[0.8125rem] text-text-faint">
        You'll get a notification at {time ? timeLabel(time) : 'that time'} that day, if reminders are on in Settings.
        {earliest > today && ` ${timeLabel(time)} has already passed today, so the earliest day is tomorrow.`}
      </p>
      {task.remind_on && (
        <Button
          variant="ghost"
          block
          className="mt-3"
          onClick={() => {
            onPick(null, null)
            onClose()
          }}
        >
          <BellOff size={16} strokeWidth={2} /> Remove reminder
        </Button>
      )}
    </Sheet>
  )
}

export { priorityOf }
