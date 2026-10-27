import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Circle, CircleCheck } from 'lucide-react'
import { useAgenda } from '../api/agenda'
import type { AgendaTask } from '../api/types'
import { fullDate, isoLocal, timeLabel } from '../lib/dates'

// A month grid: a dot under a day for each task due that day. Tap a day to see
// its list below. Monday is the first column.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function gridDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7 // Monday = 0
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

function TaskRow({ task, onOpen }: { task: AgendaTask; onOpen: (id: number) => void }) {
  const done = task.status === 'done'
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="pressable flex w-full items-start gap-3 px-4 py-3 text-left"
    >
      {done ? (
        <CircleCheck size={20} strokeWidth={1.8} className="mt-0.5 flex-shrink-0 text-success" />
      ) : (
        <Circle size={20} strokeWidth={1.8} className="mt-0.5 flex-shrink-0 text-text-faint" />
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-[0.9375rem] leading-snug ${done ? 'text-text-faint line-through' : ''}`}>
          {task.description}
        </span>
        <span className="mt-0.5 block text-[0.8125rem] text-text-muted">
          {task.due_time ? <span className="font-medium text-text">{timeLabel(task.due_time)}</span> : 'Any time'}
          {task.owner === 'them' && <> · Waiting on someone else</>}
          {task.owner !== 'them' && task.initiative && <> · {task.initiative}</>}
        </span>
      </span>
    </button>
  )
}

export default function CalendarView({ onOpenTask }: { onOpenTask: (taskId: number) => void }) {
  const today = useMemo(() => new Date(), [])
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(() => isoLocal(today))
  const days = useMemo(() => gridDays(month), [month])
  const { data, isLoading, error } = useAgenda(isoLocal(days[0]), isoLocal(days[41]))

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaTask[]>()
    for (const t of data?.tasks ?? []) {
      const list = map.get(t.due_date) ?? map.set(t.due_date, []).get(t.due_date)!
      list.push(t)
    }
    // Within a day: timed tasks in clock order, then the ones with no time.
    for (const list of map.values()) {
      list.sort((a, b) => Number(a.due_time === null) - Number(b.due_time === null) || (a.due_time ?? '').localeCompare(b.due_time ?? ''))
    }
    return map
  }, [data])

  const todayIso = isoLocal(today)
  const dayData = byDay.get(selected)
  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  function shift(by: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + by, 1)
    setMonth(next)
    setSelected(isoLocal(next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth() ? today : next))
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-1">
        <h2 className="flex-1 font-display text-[1.375rem] font-semibold tracking-[-0.025em]">{monthLabel}</h2>
        <button
          type="button"
          onClick={() => {
            setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
            setSelected(todayIso)
          }}
          className="pressable h-9 rounded-full px-3 text-sm font-medium text-link"
        >
          Today
        </button>
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="pressable flex h-9 w-9 items-center justify-center rounded-full border border-border-strong bg-bg-card">
          <ChevronLeft size={18} />
        </button>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="pressable flex h-9 w-9 items-center justify-center rounded-full border border-border-strong bg-bg-card">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-bg-card p-2">
        <div className="grid grid-cols-7 pb-1 text-center text-[0.6875rem] font-semibold uppercase tracking-wide text-text-faint">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {days.map((d) => {
            const iso = isoLocal(d)
            const inMonth = d.getMonth() === month.getMonth()
            const taskCount = byDay.get(iso)?.length ?? 0
            const isSelected = iso === selected
            const isToday = iso === todayIso
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(iso)}
                aria-label={`${fullDate(iso)}${taskCount ? `, ${taskCount} due` : ''}`}
                aria-pressed={isSelected}
                className={`pressable flex h-12 flex-col items-center justify-center gap-1 rounded-xl text-[0.9375rem] ${
                  isSelected ? 'bg-accent text-accent-contrast' : isToday ? 'ring-1 ring-accent' : ''
                } ${!inMonth && !isSelected ? 'text-text-faint' : ''}`}
              >
                <span className={isToday && !isSelected ? 'font-semibold text-accent' : ''}>{d.getDate()}</span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {taskCount > 0 && <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-accent-contrast' : 'bg-accent'}`} />}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1.5 px-1 text-[0.75rem] text-text-faint">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" /> tasks due
      </p>

      <h3 className="mt-5 mb-2 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint">
        {selected === todayIso ? 'Today · ' : ''}
        {fullDate(selected)}
      </h3>
      {error && <p className="text-sm text-danger">Couldn't load the calendar: {String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!isLoading && !error && !dayData && (
        <div className="rounded-2xl border border-dashed border-border-strong py-6 text-center text-[0.9375rem] text-text-muted">
          Nothing on this day.
        </div>
      )}
      {dayData && (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
          {dayData.map((t) => (
            <TaskRow key={`t${t.id}`} task={t} onOpen={onOpenTask} />
          ))}
        </div>
      )}
    </div>
  )
}
