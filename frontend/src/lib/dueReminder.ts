import type { Task } from '../api/types'
import { isoLocal, shortDate, timeLabel } from './dates'

// One simple model for "when is it due" and "when should I be reminded" (the Google Calendar way):
//   Due       a date, and optionally a time (no time = all day)
//   Reminder  ONE of: none | a set time before it's due | a date and time of your own
// A to-do with a due TIME is always reminded at that time on its own; the reminder you choose is an extra, earlier one.

export const DEFAULT_ALL_DAY_HOUR = '09:00' // "before" an all-day date is counted from 9 AM that day

/** Minutes before a timed due time that can be picked. */
export const EARLY_TIMED = [5, 10, 15, 30, 60, 120, 1440, 2880]
/** For an all-day date (counted from 9 AM on the day). */
export const EARLY_ALL_DAY = [1440, 2880, 10080]

export function minutesLabel(minutes: number): string {
  if (minutes % 10080 === 0) return minutes === 10080 ? '1 week' : `${minutes / 10080} weeks`
  if (minutes % 1440 === 0) return minutes === 1440 ? '1 day' : `${minutes / 1440} days`
  if (minutes % 60 === 0) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`
  return `${minutes} minutes`
}

function at(date: string, hhmm: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  return new Date(y, m - 1, d, h, min || 0)
}

/** The moment the reminder will arrive, or null when nothing is set. */
export function reminderMoment(task: Task): Date | null {
  if (task.remind_before != null && task.due_date) {
    const due = at(task.due_date, (task.due_time ?? DEFAULT_ALL_DAY_HOUR).slice(0, 5))
    return new Date(due.getTime() - task.remind_before * 60_000)
  }
  if (task.remind_on) return at(task.remind_on, (task.remind_time ?? DEFAULT_ALL_DAY_HOUR).slice(0, 5))
  if (task.due_date && task.due_time) return at(task.due_date, task.due_time.slice(0, 5))
  return null
}

/** "Fri 14 Nov, 3:30 PM" - the day and time of a moment. */
export function momentLabel(d: Date): string {
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day}, ${timeLabel(`${d.getHours()}:${d.getMinutes()}`)}`
}

/** One line for the task's sheet and row: "Due Fri 14 Nov, 4:00 PM · reminder 30 minutes before". */
export function dueAndReminderSummary(task: Task): string {
  const parts: string[] = []
  if (task.due_date) parts.push(`Due ${shortDate(task.due_date)}${task.due_time ? `, ${timeLabel(task.due_time.slice(0, 5))}` : ''}`)
  if (task.remind_before != null && task.due_date) parts.push(`reminder ${minutesLabel(task.remind_before)} before`)
  else if (task.remind_on) parts.push(`reminder ${shortDate(task.remind_on)}, ${timeLabel((task.remind_time ?? DEFAULT_ALL_DAY_HOUR).slice(0, 5))}`)
  else if (task.due_date && task.due_time) parts.push('reminder at the due time')
  return parts.join(' · ')
}

export const todayIso = () => isoLocal(new Date())
export function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoLocal(new Date(y, m - 1, d + days))
}
