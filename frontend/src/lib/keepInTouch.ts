import type { Person } from '../api/types'

// Keep in touch: how often someone wants to catch up with a contact, and when
// that falls due. The server (keep_in_touch.py) has the same rule for the
// morning brief - keep the two in step.
//
// A contact is DUE once `keep_in_touch_days` have passed since the last note
// about them (or, with no notes yet, since you first met), or once a snooze
// runs out - whichever is later. With nothing to count from it is due now.

export const FREQUENCIES = [
  { days: 7, label: 'Weekly' },
  { days: 14, label: 'Every 2 weeks' },
  { days: 30, label: 'Monthly' },
  { days: 60, label: 'Every 2 months' },
  { days: 90, label: 'Every 3 months' },
  { days: 180, label: 'Every 6 months' },
  { days: 365, label: 'Yearly' },
] as const

export function frequencyLabel(days: number | null | undefined): string {
  return FREQUENCIES.find((f) => f.days === days)?.label ?? 'Not set'
}

const DAY_MS = 86_400_000

function dayNumber(iso: string | null | undefined): number | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS : null
}

function todayNumber(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS
}

function isoFromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10)
}

/** YYYY-MM-DD, `days` from today (for a snooze). */
export function dateInDays(days: number, now: Date = new Date()): string {
  return isoFromDayNumber(todayNumber(now) + days)
}

export type KeepInTouchState = 'overdue' | 'soon' | 'ok'

export interface KeepInTouchStatus {
  /** YYYY-MM-DD the catch-up falls (or fell) due. */
  dueDate: string
  /** Days past due; 0 = due today; negative = still to come. */
  daysOverdue: number
  state: KeepInTouchState
  /** The date of the last note, or when you first met if there are none. */
  lastContact: string | null
}

/** null when this contact has no frequency set. */
export function keepInTouchStatus(p: Person, now: Date = new Date()): KeepInTouchStatus | null {
  const freq = p.keep_in_touch_days
  if (!freq) return null
  const today = todayNumber(now)
  const last = dayNumber(p.last_interaction_date) ?? dayNumber(p.first_met_date)
  let due = last !== null ? last + freq : today
  const snoozed = dayNumber(p.keep_in_touch_snoozed_until)
  if (snoozed !== null && snoozed > due) due = snoozed
  const daysOverdue = today - due
  return {
    dueDate: isoFromDayNumber(due),
    daysOverdue,
    state: daysOverdue >= 0 ? 'overdue' : daysOverdue >= -7 ? 'soon' : 'ok',
    lastContact: p.last_interaction_date ?? p.first_met_date ?? null,
  }
}

/** "Overdue 4 days", "Due today", "Due in 3 days", "Due in 5 weeks". */
export function describeKeepInTouch(s: KeepInTouchStatus): string {
  const n = s.daysOverdue
  if (n > 0) return n === 1 ? 'Overdue 1 day' : `Overdue ${n} days`
  if (n === 0) return 'Due today'
  const ahead = -n
  if (ahead === 1) return 'Due tomorrow'
  if (ahead < 14) return `Due in ${ahead} days`
  if (ahead < 60) return `Due in ${Math.round(ahead / 7)} weeks`
  return `Due in ${Math.round(ahead / 30)} months`
}
