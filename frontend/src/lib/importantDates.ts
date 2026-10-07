import type { ImportantDate } from '../api/types'

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Days in `month` (1-12), counting February as 29 - a Feb 29 birthday is a
 * real thing to store. */
export function daysInMonth(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31
}

/** Whole days from today until the next time month/day comes round (0 =
 * today). Mirrors important_dates.next_occurrence on the backend,
 * including observing Feb 29 on Feb 28 in a non-leap year. */
export function daysUntil(month: number, day: number, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const inYear = (year: number) => {
    const d = new Date(year, month - 1, day)
    return d.getMonth() === month - 1 ? d : new Date(year, 1, 28) // Feb 29 in a non-leap year
  }
  let next = inYear(today.getFullYear())
  if (next < today) next = inYear(today.getFullYear() + 1)
  return Math.round((next.getTime() - today.getTime()) / 86_400_000)
}

export function describeWhen(n: number): string {
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`
}

export function formatMonthDay(month: number, day: number): string {
  return `${MONTHS[month - 1]} ${day}`
}

/** The age someone turns on their next birthday, when a birth year is known. */
export function turningAge(entry: ImportantDate, now: Date = new Date()): number | null {
  if (!entry.year || entry.label.toLowerCase() !== 'birthday') return null
  const n = daysUntil(entry.month, entry.day, now)
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)
  return next.getFullYear() - entry.year
}

export function sameDate(a: ImportantDate, b: ImportantDate): boolean {
  return a.label.toLowerCase() === b.label.toLowerCase() && a.month === b.month && a.day === b.day
}
