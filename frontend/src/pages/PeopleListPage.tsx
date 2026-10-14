import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Search, Users } from 'lucide-react'
import { useCompanies, usePeople } from '../api/people'
import ContactRow, { contactHeadline } from '../components/ContactRow'
import ContactsTabs from '../components/ContactsTabs'
import PageIntro from '../components/PageIntro'

// The Contacts list: everyone you've logged, as one dense, scannable panel
// (the layout that works for hundreds of people - a name, a one-line headline,
// and how recently you talked), with a filter, a sort, and a way into any
// company. Reached at /people (the address is unchanged by the rename).
type Sort = 'name' | 'recent' | 'notes'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'recent', label: 'Recently talked' },
  { value: 'notes', label: 'Most notes' },
]

const selectClass =
  'rounded-lg border border-border-strong bg-bg-card px-2.5 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

export default function PeopleListPage() {
  const { data: people, isLoading, error } = usePeople()
  const { data: companies } = useCompanies()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('name')

  const q = query.trim().toLowerCase()
  const filtered = (people ?? [])
    .filter((p) => {
      if (!q) return true
      return [p.name, p.role, p.company, contactHeadline(p)].some((field) => field?.toLowerCase().includes(q))
    })
    .slice()
    .sort((a, b) => {
      if (sort === 'recent') {
        // People you've never logged a note about sink to the bottom.
        const byDate = (b.last_interaction_date ?? '').localeCompare(a.last_interaction_date ?? '')
        if (byDate !== 0) return byDate
      } else if (sort === 'notes') {
        const byCount = (b.interaction_count ?? 0) - (a.interaction_count ?? 0)
        if (byCount !== 0) return byCount
      }
      return a.name.localeCompare(b.name)
    })

  const total = people?.length ?? 0

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Users size={22} strokeWidth={1.6} className="text-accent" /> Contacts
        {total > 0 && <span className="text-base font-normal text-text-faint">{total}</span>}
      </h1>
      <PageIntro>Everyone you've talked about, with their full history in one timeline.</PageIntro>
      <ContactsTabs />

      {total > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search
              size={15}
              strokeWidth={1.6}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, role or company…"
              aria-label="Filter contacts"
              className="w-full rounded-lg border border-border-strong bg-bg-card py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <select
            aria-label="Sort contacts"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className={selectClass}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {companies && companies.length > 0 && (
            <label className="flex items-center gap-1.5 text-text-muted">
              <Building2 size={15} strokeWidth={1.6} aria-hidden />
              <select
                id="company-select"
                aria-label="Open a company"
                value=""
                onChange={(e) => {
                  if (e.target.value) navigate(`/people/company/${encodeURIComponent(e.target.value)}`)
                }}
                className={selectClass}
              >
                <option value="">Companies…</option>
                {companies.map((c) => (
                  <option key={c.company} value={c.company}>
                    {c.company} ({c.people.length})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">Couldn't load contacts: {String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!isLoading && total === 0 && (
        <p className="text-sm text-text-muted">No one logged yet — log a note on the Chat page first.</p>
      )}
      {!isLoading && total > 0 && filtered.length === 0 && (
        <p className="text-sm text-text-muted">No one matches "{query}".</p>
      )}

      {filtered.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-card">
          {filtered.map((p) => (
            <ContactRow key={p.id} person={p} />
          ))}
        </div>
      )}
    </div>
  )
}
