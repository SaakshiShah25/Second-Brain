// Human date labels for lists - "Today", "Yesterday", "Mon", "12 Oct" -
// instead of raw ISO strings. Inputs are the backend's plain
// 'YYYY-MM-DD' dates, parsed as LOCAL calendar dates (new Date('2026-10-24')
// would parse as UTC midnight and can land on the previous day west of
// GMT).

function parseLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function daysFromToday(d: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

/** Short label for a single row: Today / Yesterday / Tomorrow / weekday
 * within the week / "12 Oct" (plus year if not this year). */
export function friendlyDate(iso: string | null | undefined): string {
  if (!iso) return 'No date'
  const d = parseLocal(iso)
  if (!d) return iso
  const diff = daysFromToday(d)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  if (diff > -7 && diff < 0) return d.toLocaleDateString(undefined, { weekday: 'long' })
  if (diff > 0 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** The real calendar day, short: "29 Oct" (with the year when it isn't this one). For marking when something was noted. */
export function shortDate(iso: string | null | undefined): string {
  const d = iso ? parseLocal(iso) : null
  if (!d) return ''
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** The full calendar date for a due date: "Fri 30-Oct-2026". A to-do keeps its
 * own wording ("by Friday"); this is the exact day underneath it. */
export function fullDate(iso: string | null | undefined): string {
  if (!iso) return 'No date'
  const d = parseLocal(iso)
  if (!d) return iso
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' })
  const month = d.toLocaleDateString('en-GB', { month: 'short' })
  return `${weekday} ${String(d.getDate()).padStart(2, '0')}-${month}-${d.getFullYear()}`
}

/** Section header for grouping a reverse-chronological list, Apple
 * Notes-style: Today / Yesterday / Previous 7 days / "October" /
 * "March 2025". */
export function dateSection(iso: string | null | undefined): string {
  if (!iso) return 'Undated'
  const d = parseLocal(iso)
  if (!d) return 'Undated'
  const diff = daysFromToday(d)
  if (diff >= 0) return diff === 0 ? 'Today' : 'Upcoming'
  if (diff === -1) return 'Yesterday'
  if (diff > -7) return 'Previous 7 days'
  if (diff > -30) return 'Previous 30 days'
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, { month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** Groups items (already sorted) into consecutive sections, preserving order. */
export function groupBySection<T>(items: T[], getDate: (item: T) => string | null | undefined): { section: string; items: T[] }[] {
  const groups: { section: string; items: T[] }[] = []
  for (const item of items) {
    const section = dateSection(getDate(item))
    const last = groups[groups.length - 1]
    if (last && last.section === section) last.items.push(item)
    else groups.push({ section, items: [item] })
  }
  return groups
}

/** "19:00" or "19:00:00" -> "7:00 PM". */
export function timeLabel(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h)) return hhmm
  const d = new Date(2000, 0, 1, h, m || 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** A deadline as one label: "Fri 30-Oct-2026" or "Fri 30-Oct-2026, 7:00 PM". */
export function dueLabel(iso: string | null | undefined, time?: string | null): string {
  const day = fullDate(iso)
  return time ? `${day}, ${timeLabel(time)}` : day
}

/** The date as YYYY-MM-DD in local time (not UTC, which can land on the day before). */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
