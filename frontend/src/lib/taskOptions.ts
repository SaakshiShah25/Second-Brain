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

// A reminder arrives at a time the user picks on the day they pick (device time); with none picked it is 9 AM.
export const DEFAULT_REMIND_TIME = '09:00'

/** True when that day and time (HH:MM) have already gone by. */
export function momentPassed(date: string, time: string, now: Date = new Date()): boolean {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, min || 0) <= now
}

/** The first day a reminder at `time` can still arrive on: today if that time is still ahead, otherwise tomorrow. */
export function earliestReminderDate(now: Date = new Date(), time: string = DEFAULT_REMIND_TIME): string {
  const today = isoLocal(now)
  return momentPassed(today, time, now) ? shift(today, 1) : today
}

/** Quick choices for "remind me", in days from the due date (or from today when the task has no date).
 * Days that have already gone by are left out; whether today's time is still ahead is checked once the time is chosen. */
export function reminderChoices(dueDate: string | null, now: Date = new Date()): { label: string; date: string }[] {
  const today = isoLocal(now)
  const earliest = today
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
