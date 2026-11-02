import type { Task } from '../api/types'
import { isoLocal } from './dates'

export type Priority = 'high' | 'normal' | 'low'

// Red = most important, amber = normal, green = least. A task starts as normal.
export const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: 'high', label: 'High', color: '#dc2626' },
  { value: 'normal', label: 'Normal', color: '#d99a0b' },
  { value: 'low', label: 'Low', color: '#16a34a' },
]
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

/** Quick choices for "remind me", in days from the due date (or from today when the task has no date).
 * Dates in the past are left out. */
export function reminderChoices(dueDate: string | null): { label: string; date: string }[] {
  const today = isoLocal(new Date())
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
  return choices.filter((c) => c.date >= today)
}
