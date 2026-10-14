import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlarmClockOff, MessageSquarePlus, Users } from 'lucide-react'
import { ApiError } from '../api/client'
import { useUpdateContact, usePeople } from '../api/people'
import type { Person } from '../api/types'
import Avatar from '../components/Avatar'
import ContactsTabs from '../components/ContactsTabs'
import FrequencySelect from '../components/FrequencySelect'
import PageIntro from '../components/PageIntro'
import { contactHeadline } from '../components/ContactRow'
import { friendlyMessage } from '../lib/friendlyMessage'
import {
  dateInDays,
  describeKeepInTouch,
  FREQUENCIES,
  keepInTouchStatus,
  type KeepInTouchStatus,
} from '../lib/keepInTouch'
import { formatShortDate } from '../lib/timeAgo'

// Keep in touch: contacts grouped by how often you want to catch up, each with
// when you last talked and whether a catch-up is due. On a wide screen the
// groups sit side by side as columns (scroll sideways if there are many); on a
// phone the same groups stack as sections, since columns would force sideways
// swiping through a list.

interface Entry {
  person: Person
  status: KeepInTouchStatus | null
}

const STATE_STYLE = {
  overdue: 'bg-danger/15 text-danger',
  soon: 'bg-accent-soft text-accent',
  ok: 'bg-bg-hover text-text-muted',
} as const

function ContactCard({
  entry,
  busy,
  onFrequency,
  onSnooze,
  onCatchUp,
}: {
  entry: Entry
  busy: boolean
  onFrequency: (days: number | null) => void
  onSnooze: () => void
  onCatchUp: () => void
}) {
  const { person: p, status } = entry
  const headline = contactHeadline(p)
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3">
      <Link to={`/people/${p.id}`} className="flex items-start gap-2.5">
        <Avatar id={p.id} name={p.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold tracking-tight">{p.name}</span>
          {headline && <span className="block truncate text-xs text-text-muted">{headline}</span>}
        </span>
      </Link>

      <p className="mt-2 text-xs text-text-faint">
        {status?.lastContact
          ? `${p.last_interaction_date ? 'Last talked' : 'First met'} ${formatShortDate(status.lastContact)}`
          : 'No notes yet'}
      </p>

      {status && (
        <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_STYLE[status.state]}`}>
          {describeKeepInTouch(status)}
        </span>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        <FrequencySelect value={p.keep_in_touch_days} onChange={onFrequency} disabled={busy} className="min-w-0 flex-1 !py-1 text-xs" />
        {status && (
          <>
            <button
              type="button"
              onClick={onCatchUp}
              title="Log a catch-up"
              aria-label={`Log a catch-up with ${p.name}`}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-border-strong text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <MessageSquarePlus size={14} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              onClick={onSnooze}
              disabled={busy}
              title="Snooze for a week"
              aria-label={`Snooze ${p.name} for a week`}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-border-strong text-text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              <AlarmClockOff size={14} strokeWidth={1.7} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Column({ title, count, overdue, children }: { title: string; count: number; overdue?: number; children: React.ReactNode }) {
  return (
    <section className="md:w-[16.5rem] md:flex-shrink-0">
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">
        {title}
        <span className="font-normal">{count}</span>
        {overdue ? (
          <span className="rounded-full bg-danger/15 px-1.5 text-[10px] font-semibold normal-case tracking-normal text-danger">
            {overdue} due
          </span>
        ) : null}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

const UNSET_PAGE = 6

export default function KeepInTouchPage() {
  const navigate = useNavigate()
  const { data: people, isLoading, error } = usePeople()
  const update = useUpdateContact()
  const [unsetShown, setUnsetShown] = useState(UNSET_PAGE)

  const entries: Entry[] = (people ?? []).map((person) => ({ person, status: keepInTouchStatus(person) }))
  const tracked = entries.filter((e) => e.status)
  const untracked = entries
    .filter((e) => !e.status)
    .sort((a, b) => (b.person.last_interaction_date ?? '').localeCompare(a.person.last_interaction_date ?? ''))
  const dueCount = tracked.filter((e) => e.status!.daysOverdue >= 0).length

  const columns = FREQUENCIES.map((f) => ({
    ...f,
    items: tracked
      .filter((e) => e.person.keep_in_touch_days === f.days)
      .sort((a, b) => b.status!.daysOverdue - a.status!.daysOverdue),
  })).filter((c) => c.items.length > 0)

  const setFrequency = (id: number, days: number | null) =>
    update.mutate({ id, fields: { keep_in_touch_days: days, keep_in_touch_snoozed_until: null } })
  const snooze = (id: number) => update.mutate({ id, fields: { keep_in_touch_snoozed_until: dateInDays(7) } })
  const catchUp = (p: Person) => navigate('/', { state: { prefill: `Caught up with ${p.name} - ` } })

  const renderCard = (e: Entry) => (
    <ContactCard
      key={e.person.id}
      entry={e}
      busy={update.isPending}
      onFrequency={(days) => setFrequency(e.person.id, days)}
      onSnooze={() => snooze(e.person.id)}
      onCatchUp={() => catchUp(e.person)}
    />
  )

  const saveError =
    update.error instanceof ApiError && update.error.message.includes('Keep in touch')
      ? update.error.message
      : update.error
        ? friendlyMessage(update.error)
        : null

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Users size={22} strokeWidth={1.6} className="text-accent" /> Contacts
      </h1>
      <PageIntro>
        Choose how often you want to catch up with someone, and they show up here when it's time.
        {dueCount > 0 ? ` ${dueCount} ${dueCount === 1 ? 'catch-up is' : 'catch-ups are'} due.` : ''}
      </PageIntro>
      <ContactsTabs />

      {saveError && (
        <p role="alert" className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-text">
          {saveError}
        </p>
      )}
      {error && <p className="text-sm text-danger">Couldn't load contacts: {String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!isLoading && entries.length === 0 && (
        <p className="text-sm text-text-muted">No one logged yet - log a note on the Chat page first.</p>
      )}

      {tracked.length === 0 && entries.length > 0 && (
        <div className="mb-5 rounded-xl border border-border bg-bg-card p-4">
          <p className="text-sm text-text">No one is set up yet.</p>
          <p className="mt-1 text-xs text-text-muted">
            Pick a frequency for anyone below - they'll move into a column here and show up on Today when a catch-up is
            due.
          </p>
        </div>
      )}

      {(columns.length > 0 || untracked.length > 0) && (
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-3 md:overflow-x-auto md:pb-3">
          {columns.map((c) => (
            <Column
              key={c.days}
              title={c.label}
              count={c.items.length}
              overdue={c.items.filter((e) => e.status!.daysOverdue >= 0).length}
            >
              {c.items.map(renderCard)}
            </Column>
          ))}
          {untracked.length > 0 && (
            <Column title="Not set" count={untracked.length}>
              {untracked.slice(0, unsetShown).map(renderCard)}
              {untracked.length > unsetShown && (
                <button
                  type="button"
                  onClick={() => setUnsetShown((n) => n + UNSET_PAGE)}
                  className="px-1 text-left text-sm text-accent hover:underline"
                >
                  Show {Math.min(UNSET_PAGE, untracked.length - unsetShown)} more
                </button>
              )}
            </Column>
          )}
        </div>
      )}
    </div>
  )
}
