// A plain-language "how often do we talk" line for a person, computed from
// their note dates - no AI involved, so it can't be wrong in a confident
// way. Dates are YYYY-MM-DD strings (or null for undated notes, which are
// ignored). Returns null when there's nothing useful to say.
const DAY_MS = 86_400_000

function toDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS
}

function every(days: number): string {
  if (days < 1.5) return 'about every day'
  if (days < 10) return `about every ${Math.round(days)} days`
  if (days < 45) return `about every ${Math.round(days / 7)} weeks`
  return `about every ${Math.round(days / 30)} months`
}

export function cadenceSummary(dates: (string | null)[]): string | null {
  const days = Array.from(
    new Set(dates.map((d) => (d ? toDay(d) : null)).filter((d): d is number => d !== null)),
  ).sort((a, b) => a - b)
  if (days.length === 0) return null
  if (days.length === 1) return 'Noted on 1 day'
  // How long ago the last one was is shown separately ("Last talked ..."), so
  // this is only how often there are notes.
  const gap = (days[days.length - 1] - days[0]) / (days.length - 1)
  return `Noted on ${days.length} different days · ${every(gap)}`
}
