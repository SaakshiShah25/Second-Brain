import { Link } from 'react-router-dom'
import { HeartHandshake } from 'lucide-react'
import { usePeople } from '../api/people'
import { describeKeepInTouch, keepInTouchStatus } from '../lib/keepInTouch'
import { formatShortDate } from '../lib/timeAgo'
import Avatar from './Avatar'

// Today's view of Keep in touch: who is due for a catch-up, most overdue first.
// It replaces the old "people you haven't talked to in a while" list, which
// guessed from one global number of days - this uses the schedule the user set
// for each person.
const SHOWN = 4

export default function KeepInTouchCard() {
  const { data: people, isLoading } = usePeople()
  if (isLoading) return null

  const tracked = (people ?? [])
    .map((person) => ({ person, status: keepInTouchStatus(person) }))
    .filter((e): e is { person: (typeof e)['person']; status: NonNullable<(typeof e)['status']> } => e.status !== null)
  const due = tracked.filter((e) => e.status.daysOverdue >= 0).sort((a, b) => b.status.daysOverdue - a.status.daysOverdue)
  const next = tracked.filter((e) => e.status.daysOverdue < 0).sort((a, b) => b.status.daysOverdue - a.status.daysOverdue)[0]

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-border bg-bg-card">
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">
          <HeartHandshake size={13} strokeWidth={1.7} /> Keep in touch
          {due.length > 0 && <span className="font-normal">· {due.length} due</span>}
        </h2>
        <Link to="/people/keep-in-touch" className="text-xs text-accent hover:underline">
          {tracked.length === 0 ? 'Set up' : 'See all'}
        </Link>
      </div>

      {tracked.length === 0 && (
        <p className="px-4 pb-4 pt-1 text-sm text-text-muted">
          Choose how often you want to catch up with someone, and they'll show up here when it's time.
        </p>
      )}
      {tracked.length > 0 && due.length === 0 && (
        <p className="px-4 pb-4 pt-1 text-sm text-text-muted">
          You're all caught up.
          {next ? ` Next: ${next.person.name} - ${describeKeepInTouch(next.status).toLowerCase()}.` : ''}
        </p>
      )}
      {due.length > 0 && (
        <div className="divide-y divide-border">
          {due.slice(0, SHOWN).map(({ person: p, status }) => (
            <Link key={p.id} to={`/people/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-hover">
              <Avatar id={p.id} name={p.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block truncate text-xs text-text-faint">
                  {status.lastContact ? `Last talked ${formatShortDate(status.lastContact)}` : 'No notes yet'}
                </span>
              </span>
              <span className="flex-shrink-0 text-xs font-medium text-danger">{describeKeepInTouch(status)}</span>
            </Link>
          ))}
          {due.length > SHOWN && (
            <Link to="/people/keep-in-touch" className="block px-4 py-2.5 text-sm text-accent hover:underline">
              {due.length - SHOWN} more due
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
