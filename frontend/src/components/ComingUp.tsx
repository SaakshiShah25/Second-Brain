import { Cake, CalendarHeart } from 'lucide-react'
import { useUpcomingEvents } from '../api/agenda'
import { fullDate } from '../lib/dates'

// The next birthdays and anniversaries, soonest first. Shows nothing when
// there are none (or until the key-date table exists), so it never adds an
// empty card.
export default function ComingUp({ days = 30 }: { days?: number }) {
  const { data } = useUpcomingEvents(days)
  const events = (data?.events ?? []).slice(0, 5)
  if (events.length === 0) return null
  return (
    <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4" aria-label="Coming up">
      <h2 className="mb-2 text-[0.9375rem] font-semibold">Coming up{days <= 7 ? " this week" : ""}</h2>
      <ul className="divide-y divide-border">
        {events.map((e) => {
          const Icon = e.date_type === 'birthday' ? Cake : CalendarHeart
          const when = e.days_until === 0 ? 'Today' : e.days_until === 1 ? 'Tomorrow' : `In ${e.days_until} days`
          return (
            <li key={`${e.key_date_id}-${e.date}`} className="flex items-center gap-3 py-2.5">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
                <Icon size={17} strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] leading-snug">{e.title}</span>
                <span className="block text-[0.8125rem] text-text-muted">{fullDate(e.date)}</span>
              </span>
              <span className="flex-shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 text-[0.75rem] font-medium text-brand-ink">
                {when}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
