import { useState } from 'react'
import { Bell, Calendar, Check, Clock } from 'lucide-react'
import { useEditTask, type ItemEdit } from '../api/tasks'
import type { Task } from '../api/types'
import { datedLabel, timeLabel } from '../lib/dates'
import { DEFAULT_ALL_DAY_HOUR, EARLY_ALL_DAY, minutesLabel, momentLabel, reminderMoment, shiftDays, todayIso } from '../lib/dueReminder'
import Button from './Button'
import { Toggle } from './ListGroup'
import Sheet from './Sheet'
import { Input } from './fields'

// Due and reminder, in one place, the way a calendar does it. A reminder always comes BEFORE the due date:
//   1. When is it due?  a date (quick buttons for today / tomorrow / next week) and, if you want, a time.
//   2. Remind me:  a few obvious choices (at the due time, 10 minutes before, an hour, a day...) or "at a date and time" of
//      your own - and that date can never be after the due date (nor the time after the due time on that day).
// Every tap is saved at once and a line says exactly when the reminder will arrive.
function Choice({ selected, label, hint, disabled, onClick }: { selected: boolean; label: string; hint?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={`pressable flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left disabled:opacity-40 ${selected ? 'bg-accent-soft' : ''}`}
    >
      <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-accent bg-accent text-accent-contrast' : 'border-border-strong'}`}>
        {selected && <Check size={12} strokeWidth={3.2} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[0.9375rem] ${selected ? 'font-semibold' : ''}`}>{label}</span>
        {hint && <span className="block text-[0.8125rem] text-text-muted">{hint}</span>}
      </span>
    </button>
  )
}

// The choices offered, in minutes before the due time. A date with no time counts from 9 AM that day.
const PRESETS_TIMED = [10, 30, 60, 1440]
const PRESETS_ALL_DAY = EARLY_ALL_DAY

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

export default function DueReminderSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const edit = useEditTask()
  const [customOpen, setCustomOpen] = useState(false)
  const [customDate, setCustomDate] = useState(task.remind_on ?? '')
  const [customTime, setCustomTime] = useState((task.remind_time ?? DEFAULT_ALL_DAY_HOUR).slice(0, 5))
  const [note, setNote] = useState('')
  const save = (fields: ItemEdit) => edit.mutate({ taskId: task.id, ...fields })

  const today = todayIso()
  const hasDue = !!task.due_date
  const dueTime = task.due_time ? task.due_time.slice(0, 5) : null
  const timed = hasDue && !!dueTime
  const remindTime = (task.remind_time ?? DEFAULT_ALL_DAY_HOUR).slice(0, 5)
  const NONE = { remind_before: null, remind_on: null, remind_time: null } as const

  // Which reminder choice is the current one.
  const hasBefore = task.remind_before != null && hasDue
  const onTheDay = hasDue && !timed && task.remind_on === task.due_date && remindTime === DEFAULT_ALL_DAY_HOUR && !hasBefore
  const atDueTime = timed && !hasBefore && (!task.remind_on || (task.remind_on === task.due_date && remindTime === dueTime))
  const isCustom = !!task.remind_on && !hasBefore && !onTheDay && !atDueTime
  const preset = hasBefore && (timed ? PRESETS_TIMED : PRESETS_ALL_DAY).includes(task.remind_before!)

  const moment = reminderMoment(task)
  const passed = (d: Date) => d.getTime() <= Date.now()
  const dueAt = (): Date | null => {
    if (!task.due_date) return null
    const [y, m, d] = task.due_date.split('-').map(Number)
    const [h, min] = (dueTime ?? '23:59').split(':').map(Number)
    return new Date(y, m - 1, d, h, min)
  }
  // The moment a "before" choice would fire, to grey out the ones that are already over.
  const beforeMoment = (minutes: number) => {
    const due = dueAt()
    if (!due) return null
    const base = dueTime ? due : new Date(due.getFullYear(), due.getMonth(), due.getDate(), 9, 0)
    return new Date(base.getTime() - minutes * 60_000)
  }

  // A reminder of your own must be in the future and no later than the due date (and, on the due day, before the due time).
  const customAt = customDate && customTime ? new Date(`${customDate}T${customTime}:00`) : null
  const customProblem = (() => {
    if (!customAt || Number.isNaN(customAt.getTime())) return ''
    if (customAt.getTime() <= Date.now()) return 'That time has already passed.'
    if (task.due_date && customDate > task.due_date) return 'A reminder has to come before the due date.'
    if (timed && customDate === task.due_date && customTime >= dueTime!) return `On the due day it has to be before ${timeLabel(dueTime)}.`
    return ''
  })()
  // On the day itself the time picker is limited too.
  const timeMin = customDate === today ? hhmm(new Date(Date.now() + 60_000)) : undefined
  const timeMax = timed && customDate === task.due_date ? dueTime! : undefined

  const dueChips = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: shiftDays(today, 1) },
    { label: 'Next week', date: shiftDays(today, 7) },
  ]
  // Changing when it is due can leave an existing reminder after the new due moment: it is then cleared, and says so.
  function afterDueChange(next: { due_date: string | null; due_time: string | null }): ItemEdit {
    if (!next.due_date) {
      if (moment) setNote('The reminder was removed with the due date.')
      return { ...next, ...NONE } // no date: nothing to count a reminder from
    }
    if (task.remind_on && !hasBefore) {
      const [y, m, d] = next.due_date.split('-').map(Number)
      const [h, min] = (next.due_time ?? '23:59').split(':').map(Number)
      const newDue = new Date(y, m - 1, d, h, min)
      const at = reminderMoment({ ...task, remind_on: task.remind_on, remind_time: task.remind_time })
      if (at && at.getTime() >= newDue.getTime()) {
        setNote('The reminder was removed because it would now come after the due date.')
        return { ...next, ...NONE }
      }
    }
    setNote('')
    return next
  }
  const setDue = (date: string | null) => save(afterDueChange({ due_date: date, due_time: date ? task.due_time ?? null : null }))

  return (
    <Sheet onClose={onClose} tall>
      <h3 className="text-lg font-semibold tracking-tight">Due and reminder</h3>
      <p className="mt-0.5 mb-4 line-clamp-2 text-[0.9375rem] text-text-muted">{task.description}</p>

      <div className="mb-4 rounded-2xl bg-bg-elevated p-3.5">
        {/* 1. Due */}
        <section aria-label="Due">
          <p className="mb-2.5 flex items-center gap-2 text-[0.9375rem] font-semibold">
            <Calendar size={17} strokeWidth={2} className="text-text-muted" /> Due
          </p>
          <div className="mb-2.5 flex flex-wrap gap-2">
            {dueChips.map((c) => (
              <button
                key={c.label}
                type="button"
                aria-pressed={task.due_date === c.date}
                onClick={() => setDue(c.date)}
                className={`pressable h-10 rounded-full border px-3.5 text-[0.875rem] font-medium ${
                  task.due_date === c.date ? 'border-accent/40 bg-accent-soft text-accent ring-1 ring-accent/40' : 'border-border-strong bg-bg-card'
                }`}
              >
                {c.label}
              </button>
            ))}
            {hasDue && (
              <button type="button" onClick={() => setDue(null)} className="pressable h-10 rounded-full px-3 text-[0.875rem] font-medium text-text-muted">
                No date
              </button>
            )}
          </div>
          <label className="block">
            <span className="mb-1 block text-[0.8125rem] font-medium text-text-muted">Or pick a date</span>
            <Input type="date" aria-label="Due date" value={task.due_date ?? ''} onChange={(e) => setDue(e.target.value || null)} />
          </label>
          {hasDue && (
            <div className="mt-3">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-[0.9375rem]">
                  All day
                  <span className="block text-[0.8125rem] text-text-muted">{timed ? `Due at ${timeLabel(dueTime)}` : 'No particular time'}</span>
                </span>
                <Toggle
                  on={!timed}
                  label="All day"
                  onChange={() => {
                    if (timed) {
                      // To all day: a "before" counted from a time of day no longer makes sense.
                      save({ due_time: null, ...(hasBefore && !PRESETS_ALL_DAY.includes(task.remind_before!) ? { remind_before: null } : {}) })
                    } else save(afterDueChange({ due_date: task.due_date!, due_time: DEFAULT_ALL_DAY_HOUR }))
                  }}
                />
              </div>
              {/* On its own line, full width: next to the toggle it squeezed the label into a column of letters. */}
              {timed && (
                <label className="mt-2.5 block">
                  <span className="mb-1 flex items-center gap-1.5 text-[0.8125rem] font-medium text-text-muted">
                    <Clock size={13} strokeWidth={2} /> Time
                  </span>
                  <Input
                    type="time"
                    aria-label="Due time"
                    value={dueTime ?? ''}
                    onChange={(e) => e.target.value && save(afterDueChange({ due_date: task.due_date!, due_time: e.target.value }))}
                  />
                </label>
              )}
            </div>
          )}
        </section>

        <hr className="my-4 border-border" />

        {/* 2. Remind me - always before the due date */}
        <section aria-label="Reminder">
          <p className="flex items-center gap-2 text-[0.9375rem] font-semibold">
            <Bell size={17} strokeWidth={2} className="text-text-muted" /> Remind me
          </p>
          {!hasDue ? (
            <p className="mt-1 text-[0.875rem] text-text-muted">Set a due date first. A reminder always comes before it.</p>
          ) : (
            <>
              <p className={`mt-1 mb-2.5 text-[0.875rem] ${moment ? 'font-medium text-accent' : 'text-text-muted'}`}>
                {moment ? `${passed(moment) ? 'Was set for' : 'Reminds you'} ${momentLabel(moment)}` : 'No reminder'}
              </p>
              <div role="radiogroup" aria-label="Reminder" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
                {timed ? (
                  <Choice selected={atDueTime && !customOpen} label={`At ${timeLabel(dueTime)}`} hint="When it's due" onClick={() => (setCustomOpen(false), save({ ...NONE }))} />
                ) : (
                  <>
                    <Choice selected={!hasBefore && !task.remind_on && !customOpen} label="No reminder" onClick={() => (setCustomOpen(false), save({ ...NONE }))} />
                    <Choice selected={onTheDay && !customOpen} label="On the day, 9:00 AM" onClick={() => (setCustomOpen(false), save({ remind_before: null, remind_on: task.due_date, remind_time: null }))} />
                  </>
                )}
                {(timed ? PRESETS_TIMED : PRESETS_ALL_DAY).map((m) => {
                  const when = beforeMoment(m)
                  return (
                    <Choice
                      key={m}
                      selected={preset && task.remind_before === m && !customOpen}
                      label={`${minutesLabel(m)} before`}
                      hint={when && !timed ? momentLabel(when) : undefined}
                      disabled={!!when && passed(when)}
                      onClick={() => (setCustomOpen(false), save({ remind_before: m, remind_on: null, remind_time: null }))}
                    />
                  )
                })}
                <Choice selected={isCustom || customOpen} label="At a date and time" hint={isCustom && !customOpen ? momentLabel(reminderMoment(task)!) : undefined} onClick={() => setCustomOpen((v) => !v)} />
              </div>
              {(customOpen || isCustom) && (
                <div className="mt-3">
                  {/* Day first, then the time of day, then the button that says what it does. */}
                  <div className="flex items-end gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="mb-1 flex items-center gap-1.5 text-[0.8125rem] font-medium text-text-muted">
                        <Calendar size={13} strokeWidth={2} /> Day
                      </span>
                      <Input type="date" aria-label="Reminder day" min={today} max={task.due_date ?? undefined} value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
                    </label>
                    <label className="w-40 flex-shrink-0">
                      <span className="mb-1 flex items-center gap-1.5 text-[0.8125rem] font-medium text-text-muted">
                        <Clock size={13} strokeWidth={2} /> Time
                      </span>
                      <Input type="time" aria-label="Reminder time" min={timeMin} max={timeMax} value={customTime} onChange={(e) => setCustomTime(e.target.value)} />
                    </label>
                  </div>
                  <Button
                    variant="primary"
                    block
                    className="mt-3"
                    disabled={!customAt || !!customProblem}
                    onClick={() => {
                      save({ remind_on: customDate, remind_time: customTime === DEFAULT_ALL_DAY_HOUR ? null : customTime, remind_before: null })
                      setCustomOpen(false)
                    }}
                  >
                    {customAt && !customProblem ? `Remind me ${momentLabel(customAt)}` : 'Set reminder'}
                  </Button>
                  <p className={`mt-2 text-[0.8125rem] ${customProblem ? 'text-danger' : 'text-text-muted'}`}>
                    {customProblem || `Any day up to ${datedLabel(task.due_date)}${timed ? `, before ${timeLabel(dueTime)} on the day` : ''}.`}
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {note && <p className="mb-3 text-[0.8125rem] text-text-muted">{note}</p>}
      {edit.isError && <p className="mb-3 text-[0.8125rem] text-danger">{edit.error instanceof Error ? edit.error.message : "Couldn't save that - please try again."}</p>}
      <Button variant="primary" size="lg" block onClick={onClose}>
        Done
      </Button>
    </Sheet>
  )
}
