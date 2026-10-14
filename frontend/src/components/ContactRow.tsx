import { Link } from 'react-router-dom'
import { Cake } from 'lucide-react'
import type { Person } from '../api/types'
import { daysUntil, describeWhen } from '../lib/importantDates'
import { timeAgo } from '../lib/timeAgo'
import Avatar from './Avatar'
import Highlight from './Highlight'

// One contact as a dense, scannable row - avatar, name, a one-line headline
// (role and company), and on the right how long since you last talked and how
// many notes you have. Used for the Contacts list and in search results, so a
// person looks the same wherever they appear.

/** "Product Manager · Acme" - role and company only. Never their description
 * or personal notes: those are private observations ("warm, generous"), not
 * something to show beside a name in a list, in search results or anywhere
 * someone else might glance at the screen. Empty when neither is known. */
export function contactHeadline(p: Person): string {
  return [p.role, p.company].filter(Boolean).join(' · ')
}

/** The soonest birthday/anniversary within two weeks, as "Birthday in 3 days". */
function soonDate(p: Person): string | null {
  let best: { label: string; n: number } | null = null
  for (const d of p.important_dates ?? []) {
    const n = daysUntil(d.month, d.day)
    if (n <= 14 && (!best || n < best.n)) best = { label: d.label, n }
  }
  return best ? `${best.label} ${describeWhen(best.n)}` : null
}

interface ContactRowProps {
  person: Person
  terms?: string[]
  // Keyboard-highlighted row in the search list.
  active?: boolean
  // Search lists pass this so they can move the highlight on hover.
  onHover?: () => void
}

export default function ContactRow({ person: p, terms = [], active = false, onHover }: ContactRowProps) {
  const headline = contactHeadline(p)
  const soon = soonDate(p)
  const last = p.last_interaction_date ? `Last talked ${timeAgo(p.last_interaction_date)}` : null
  const count = p.interaction_count ?? 0

  return (
    <Link
      to={`/people/${p.id}`}
      onMouseEnter={onHover}
      className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
        active ? 'bg-accent-soft' : 'hover:bg-bg-hover'
      }`}
    >
      <Avatar id={p.id} name={p.name} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[15px] font-semibold tracking-tight">
            <Highlight text={p.name} terms={terms} />
          </span>
          {headline && (
            <span className="hidden min-w-0 truncate text-sm text-text-muted sm:inline">
              <Highlight text={headline} terms={terms} />
            </span>
          )}
        </p>
        {/* On a phone the headline and the last-talked line stack under the name. */}
        {headline && (
          <p className="truncate text-xs text-text-muted sm:hidden">
            <Highlight text={headline} terms={terms} />
          </p>
        )}
        {last && <p className="truncate text-xs text-text-faint sm:hidden">{last}</p>}
        {soon && (
          <p className="flex items-center gap-1 truncate text-xs font-medium text-accent sm:hidden">
            <Cake size={11} strokeWidth={1.8} />
            {soon}
          </p>
        )}
      </div>
      <div className="hidden flex-shrink-0 flex-col items-end gap-0.5 text-xs sm:flex">
        {soon && (
          <span className="flex items-center gap-1 font-medium text-accent">
            <Cake size={12} strokeWidth={1.8} />
            {soon}
          </span>
        )}
        {last ? <span className="text-text-muted">{last}</span> : <span className="text-text-faint">No notes yet</span>}
        {count > 0 && (
          <span className="text-text-faint">
            {count} {count === 1 ? 'note' : 'notes'}
          </span>
        )}
      </div>
    </Link>
  )
}
