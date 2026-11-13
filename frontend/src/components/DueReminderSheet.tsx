import { useState } from 'react'
import { Bell, Calendar, Check } from 'lucide-react'
import { useEditTask, type ItemEdit } from '../api/tasks'
import type { Task } from '../api/types'
import { datedLabel, timeLabel } from '../lib/dates'
import { DEFAULT_ALL_DAY_HOUR, EARLY_ALL_DAY, EARLY_TIMED, minutesLabel, momentLabel, reminderMoment, shiftDays, todayIso } from '../lib/dueReminder'
import Button from './Button'
import { Toggle } from './ListGroup'
import Sheet from './Sheet'
import { Input } from './fields'

// Due and reminder, in one place, the way a calendar does it:
//   1. When is it due?  a date (quick buttons for today / tomorrow / next week) and, if you want, a time.
//   2. When should I remind you?  ONE choice: at the due time, a set time before it, or a day and time of your own.
// Every tap is saved at once and the line at the top of "Reminder" says exactly when it will arrive.
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

export default function DueReminderSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const edit = useEditTask()
  const [customOpen, setCustomOpen] = useState(false)
  const [customDate, setCustomDate] = useState(task.remind_on ?? '')
  const [customTime, setCustomTime] = useState((task.remind_time ?? DEFAULT_ALL_DAY_HOUR).slice(0, 5))
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
  const none = !hasBefore && !task.remind_on

  const moment = reminderMoment(task)
  const passed = (d: Date) => d.getTime() <= Date.now()
  // The moment a "before" choice would fire, to grey out the ones that are already over.
  const beforeMoment = (minutes: number) => {
    if (!task.due_date) return null
    const [y, m, d] = task.due_date.split('-').map(Number)
    const [h, min] = (dueTime ?? DEFAULT_ALL_DAY_HOUR).split(':').map(Number)
    return new Date(new Date(y, m - 1, d, h, min).getTime() - minutes * 60_000)
  }

  const dueChips = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: shiftDays(today, 1) },
    { label: 'Next week', date: shiftDays(today, 7) },
  ]
  function setDue(date: string | null) {
    if (!date) return save({ due_date: null, due_time: null, ...NONE }) // no date: nothing to count a reminder from
    save({ due_date: date })
  }

  return (
    <Sheet onClose={onClose} tall>
      <h3 className="text-lg font-semibold tracking-tight">Due and reminder</h3>
      <p className="mt-0.5 mb-4 line-clamp-2 text-[0.9375rem] text-text-muted">{task.description}</p>

      {/* 1. Due */}
      <section className="mb-4 rounded-2xl bg-bg-elevated p-3.5" aria-label="Due">
        <p className="mb-2.5 flex items-center gap-2 text-[0.9375rem] font-semibold">
          <Calendar size={17} strokeWidth={2} className="text-text-muted" /> When is it due?
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
        <Input type="date" aria-label="Due date" value={task.due_date ?? ''} onChange={(e) => setDue(e.target.value || null)} />
        {hasDue && (
          <div className="mt-3 flex items-center gap-3">
            <span className="min-w-0 flex-1 text-[0.9375rem]">
              All day
              <span className="block text-[0.8125rem] text-text-muted">{timed ? `Due at ${timeLabel(dueTime)}` : 'No particular time'}</span>
            </span>
            {timed && <Input type="time" aria-label="Due time" value={dueTime ?? ''} onChange={(e) => e.target.value && save({ due_time: e.target.value })} className="w-32" />}
            <Toggle
              on={!timed}
              label="All day"
              onChange={() => {
                if (timed) {
                  // To all day: a "before" that was counted from a time of day no longer makes sense - back to "none".
                  save({ due_time: null, ...(hasBefore && !EARLY_ALL_DAY.includes(task.remind_before!) ? { remind_before: null } : {}) })
                } else save({ due_time: DEFAULT_ALL_DAY_HOUR })
              }}
            />
          </div>
        )}
        {hasDue && <p className="mt-2.5 text-[0.8125rem] text-text-muted">{datedLabel(task.due_date)}{timed ? `, ${timeLabel(dueTime)}` : ''}</p>}
      </section>

      {/* 2. Reminder */}
      <section className="mb-4 rounded-2xl bg-bg-elevated p-3.5" aria-label="Reminder">
        <p className="flex items-center gap-2 text-[0.9375rem] font-semibold">
          <Bell size={17} strokeWidth={2} className="text-text-muted" /> When should I remind you?
        </p>
        <p className={`mt-1 mb-2.5 text-[0.875rem] ${moment ? 'font-medium text-accent' : 'text-text-muted'}`}>
          {moment ? `${passed(moment) ? 'Was due to remind you' : 'Reminds you'} ${momentLabel(moment)}` : hasDue ? 'No reminder' : 'Add a due date to be reminded before it, or pick a day and time of your own.'}
        </p>
        <div role="radiogroup" aria-label="Reminder" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
          {timed && (
            <Choice selected={atDueTime} label={`At ${timeLabel(dueTime)}`} hint="When it's due - the usual one" onClick={() => save({ ...NONE })} />
          )}
          {!timed && <Choice selected={none} label="No reminder" onClick={() => save({ ...NONE })} />}
          {hasDue && !timed && (
            <Choice selected={onTheDay} label="On the day, 9:00 AM" onClick={() => save({ remind_before: null, remind_on: task.due_date, remind_time: null })} />
          )}
          {hasDue &&
            (timed ? EARLY_TIMED : EARLY_ALL_DAY).map((m) => {
              const when = beforeMoment(m)
              return (
                <Choice
                  key={m}
                  selected={task.remind_before === m}
                  label={`${minutesLabel(m)} before`}
                  hint={when && !timed ? `${momentLabel(when)}` : undefined}
                  disabled={!!when && passed(when)}
                  onClick={() => save({ remind_before: m, remind_on: null, remind_time: null })}
                />
              )
            })}
          {!hasDue && [{ label: 'Tomorrow, 9:00 AM', date: shiftDays(today, 1) }, { label: 'Next week, 9:00 AM', date: shiftDays(today, 7) }].map((c) => (
            <Choice key={c.label} selected={task.remind_on === c.date && remindTime === DEFAULT_ALL_DAY_HOUR} label={c.label} onClick={() => save({ remind_on: c.date, remind_time: null, remind_before: null })} />
          ))}
          <Choice
            selected={isCustom || customOpen}
            label="Pick a day and time"
            hint={isCustom ? `${momentLabel(reminderMoment(task)!)}` : undefined}
            onClick={() => setCustomOpen((v) => !v)}
          />
        </div>
        {(customOpen || isCustom) && (
          <div className="mt-3 flex items-center gap-2">
            <Input type="date" aria-label="Reminder date" min={today} value={customDate} onChange={(e) => setCustomDate(e.target.value)} className="flex-1" />
            <Input type="time" aria-label="Reminder time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} className="w-32" />
            <Button
              variant="primary"
              disabled={!customDate || !customTime}
              onClick={() => {
                save({ remind_on: customDate, remind_time: customTime === DEFAULT_ALL_DAY_HOUR ? null : customTime, remind_before: null })
                setCustomOpen(false)
              }}
            >
              Set
            </Button>
          </div>
        )}
      </section>

      {edit.isError && <p className="mb-3 text-[0.8125rem] text-danger">{edit.error instanceof Error ? edit.error.message : "Couldn't save that - please try again."}</p>}
      <Button variant="primary" size="lg" block onClick={onClose}>
        Done
      </Button>
    </Sheet>
  )
}
