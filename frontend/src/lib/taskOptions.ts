import type { Task } from '../api/types'
import { isoLocal } from './dates'

export type Priority = 'high' | 'normal' | 'low'

// Red = most important, amber = normal, green = least. A task starts as normal.
export const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: 'high', label: 'High', color: 'var(--sb-prio-high)' },
  { value: 'normal', label: 'Normal', color: 'var(--sb-prio-normal)' },
  { value: 'low', label: 'Low', color: 'var(--sb-prio-low)' },
]
// The colours are theme tokens (soft in both Paper and Graphite); a tint of one for backgrounds and outlines.
export const tint = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`
export const ON_PRIORITY = 'var(--sb-prio-on)' // text on a filled priority colour
export const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 }

export function priorityOf(task: Task): Priority {
  return task.priority ?? 'normal'
}

/** The category a task sits under: its own once it has one (it can be moved), else its note's. */
export function taskInitiativeId(task: Task): number | null {
  if (task.initiative_id !== undefined) return task.initiative_id
  return task.interaction?.initiative?.id ?? null
}

function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoLocal(new Date(y, m - 1, d + days))
}

// Reminders go out at 9 AM (device time) on their day, so once it is 9 AM today, today is no longer a day a
// reminder can still arrive.
export const REMINDER_HOUR = 9

/** The first day a reminder can still be set for: today before 9 AM, otherwise tomorrow. */
export function earliestReminderDate(now: Date = new Date()): string {
  const today = isoLocal(now)
  return now.getHours() >= REMINDER_HOUR ? shift(today, 1) : today
}

/** Quick choices for "remind me", in days from the due date (or from today when the task has no date).
 * Days a reminder can no longer arrive on (earlier than today, or today after 9 AM) are left out. */
export function reminderChoices(dueDate: string | null, now: Date = new Date()): { label: string; date: string }[] {
  const today = isoLocal(now)
  const earliest = earliestReminderDate(now)
  const choices = dueDate
    ? [
        { label: 'On the day it is due', date: dueDate },
        { label: '1 day before', date: shift(dueDate, -1) },
        { label: '2 days before', date: shift(dueDate, -2) },
        { label: '1 week before', date: shift(dueDate, -7) },
      ]
    : [
        { label: 'Tomorrow', date: shift(today, 1) },
        { label: 'In 3 days', date: shift(today, 3) },
        { label: 'In a week', date: shift(today, 7) },
      ]
  return choices.filter((c) => c.date >= earliest)
}
