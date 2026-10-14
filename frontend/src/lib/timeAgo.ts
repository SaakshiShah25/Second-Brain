// "today", "yesterday", "3 days ago", "2 weeks ago", "5 months ago" - how long
// ago a YYYY-MM-DD date was, for places where a bare date is hard to read at a
// glance (the Contacts list's "last talked").
export function timeAgo(isoDate: string, now: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!m) return isoDate
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today - then) / 86_400_000)
  if (days <= 0) return 'today' // a note dated in the future reads as today, not "-2 days ago"
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return months === 1 ? '1 month ago' : `${months} months ago`
  }
  const years = Math.floor(days / 365)
  return years === 1 ? '1 year ago' : `${years} years ago`
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 3" - or "Oct 3, 2025" when it isn't this year - for a YYYY-MM-DD date. */
export function formatShortDate(isoDate: string, now: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!m) return isoDate
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const base = `${MONTHS_SHORT[month - 1]} ${day}`
  return year === now.getFullYear() ? base : `${base}, ${year}`
}
