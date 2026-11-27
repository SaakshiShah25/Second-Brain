import type { Task } from '../api/types'
import { isoLocal, shortDate, timeLabel } from './dates'
import { DEFAULT_ALL_DAY_HOUR } from './dueReminder'
import { byDue, isOverdue } from './items'
import { priorityOf } from './taskOptions'

// The Today view read as a day: each to-do's time in a column on the right, and the one to do next called out at the top.

const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** On Today only because you asked to be reminded about it today (it isn't due today and isn't overdue). */
export function remindedOnly(task: Task, today: string): boolean {
  return task.remind_on === today && !(task.due_date && task.due_date <= today)
}

/** The time of day (HH:MM) this one belongs to today - when it is due, or when you asked to be reminded - else null. */
export function timeToday(task: Task, today: string): string | null {
  if (remindedOnly(task, today)) return (task.remind_time ?? DEFAULT_ALL_DAY_HOUR).slice(0, 5)
  return task.due_date === today && task.due_time ? task.due_time.slice(0, 5) : null
}

/** Today in the order the day happens: by time, then the ones with no time. */
export function byTimeToday(today: string) {
  return (a: Task, b: Task) => (timeToday(a, today) ?? '99').localeCompare(timeToday(b, today) ?? '99') || byDue(a, b) || a.id - b.id
}

export interface TimeSlot {
  top: string // "10:00 AM", "All day", or "Due 30 Nov" for another day
  bottom: string // the hour, when another day has one
  tone: 'danger' | 'normal' | 'faint'
}

/** What the column on a row says: when the to-do is DUE - never when its reminder is (that is the bell's job), so a row
 *  can't show two dates that look alike. A bare time or "All day" means today; any other day is written "Due …".
 *  Null when it has no due date. */
export function timeSlot(task: Task, now: Date = new Date()): TimeSlot | null {
  if (!task.due_date) return null
  const today = isoLocal(now)
  const done = task.status === 'done'
  const late = !done && isOverdue(task, now)
  const slot = (top: string, bottom = '', tone: TimeSlot['tone'] = late ? 'danger' : 'normal'): TimeSlot => ({ top, bottom, tone: done ? 'faint' : tone })
  const hour = task.due_time ? timeLabel(task.due_time.slice(0, 5)) : ''
  if (task.due_date === today) return hour ? slot(hour) : slot('All day', '', 'faint')
  const yesterday = isoLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const day = task.due_date === yesterday ? 'yesterday' : shortDate(task.due_date)
  return slot(`Due ${day}`, hour, late ? 'danger' : 'faint')
}

export interface UpNext {
  // "Up next": still to come today at a set time. "Start with": nothing timed ahead, so the first thing on the list.
  // "Coming up": nothing left today; the next dated one.
  label: 'Up next' | 'Start with' | 'Coming up'
  task: Task
}

/** How many are on the Today view and still open: overdue, due today, reminded today, or marked high priority. One
 *  count for the page's summary and the sidebar's badge, so the two never disagree. */
export function openOnToday(tasks: Task[], now: Date = new Date()): number {
  const today = isoLocal(now)
  return tasks.filter(
    (t) =>
      t.status === 'open' &&
      (isOverdue(t, now) || t.due_date === today || (!t.list_id && (remindedOnly(t, today) || priorityOf(t) === 'high'))),
  ).length
}

/** `listed` is what is still open on Today, in the order it is shown; `later` is what is dated after today, soonest first. */
export function pickUpNext(listed: Task[], later: Task[], now: Date = new Date()): UpNext | null {
  const today = isoLocal(now)
  const ahead = listed.filter((t) => (timeToday(t, today) ?? '') >= clock(now)).sort(byTimeToday(today))
  if (ahead.length) return { label: 'Up next', task: ahead[0] }
  if (listed.length) return { label: 'Start with', task: listed[0] }
  return later.length ? { label: 'Coming up', task: later[0] } : null
}

/** "in 25 min", "in 2 hr 10 min", "now" - how far off a time later today is. */
export function inHowLong(hhmm: string, now: Date = new Date()): string {
  const [h, m] = hhmm.split(':').map(Number)
  const minutes = h * 60 + m - (now.getHours() * 60 + now.getMinutes())
  if (minutes <= 0) return 'now'
  if (minutes < 60) return `in ${minutes} min`
  const rest = minutes % 60
  return `in ${Math.floor(minutes / 60)} hr${rest ? ` ${rest} min` : ''}`
}
