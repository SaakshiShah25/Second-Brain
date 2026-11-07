import type { Repeat, Task } from '../api/types'
import { isoLocal, timeLabel } from './dates'
import { taskInitiativeId } from './taskOptions'

export const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
  { value: 'hours:1', label: 'Every hour (9 AM–9 PM)' },
  { value: 'hours:2', label: 'Every 2 hours (9 AM–9 PM)' },
  { value: 'hours:3', label: 'Every 3 hours (9 AM–9 PM)' },
]

/** "Every 2 hours", "Every year"... for an item's repeat; '' when it doesn't repeat. */
export function repeatLabel(repeat: Repeat | null | undefined): string {
  if (!repeat) return ''
  const known = REPEAT_OPTIONS.find((o) => o.value === repeat)
  if (known) return known.label.replace(/ \(.*\)$/, '')
  const hours = /^hours:(\d+)$/.exec(repeat)
  return hours ? `Every ${hours[1]} hours` : repeat
}

export function todayIso(): string {
  return isoLocal(new Date())
}

export function isOverdue(task: Task): boolean {
  return task.status === 'open' && !!task.due_date && task.due_date < todayIso()
}

/** The category an item belongs to: its own, or the one its note was filed under. */
export function itemInitiativeId(task: Task): number | null {
  return task.initiative_id ?? task.interaction?.initiative?.id ?? null
}

/** Nearest deadline first, then by time of day; undated last. */
export function byDue(a: Task, b: Task): number {
  return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.due_time ?? '99').localeCompare(b.due_time ?? '99')
}

/** Where an item opens: Today shows any item's sheet (`?open=<id>`), whatever its list or date. */
export function itemPath(open?: number): string {
  return open ? `/today?open=${open}` : '/today'
}

/** What an item reminds you about on its own (no bell set), in words - or '' when it doesn't. */
export function autoReminderText(task: Task): string {
  if (task.remind_on || !task.due_date) return ''
  const hours = /^hours:(\d+)$/.exec(task.repeat ?? '')
  if (hours) return `Every ${hours[1]} hours, 9 AM–9 PM`
  if (task.due_time) return `At ${timeLabel(task.due_time.slice(0, 5))} on the day`
  if (task.repeat === 'yearly') return 'The evening before, 8 PM'
  return ''
}

/** Open items per initiative (-1 = Others), for the chips at the foot of Today, Lists and a list. */
export function openCountsByInitiative(tasks: Task[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const t of tasks) {
    if (t.status !== 'open') continue
    const key = taskInitiativeId(t) ?? -1
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}
