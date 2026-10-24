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
