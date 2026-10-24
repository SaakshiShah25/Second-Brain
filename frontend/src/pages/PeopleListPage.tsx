import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ChevronRight, Search, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCompanies, useCompanyBriefing, usePeople } from '../api/people'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { Label, Select } from '../components/fields'
import PageHeader from '../components/PageHeader'
import Sheet from '../components/Sheet'
import { useUsageMode } from '../lib/usageMode'

function CompanyBriefingSheet({ onClose }: { onClose: () => void }) {
  const { data: companies } = useCompanies()
  const [selected, setSelected] = useState('')
  const briefing = useCompanyBriefing()
  const multiContact = (companies ?? []).filter((c) => c.people.length > 1)

  return (
    <Sheet onClose={onClose} title="Company briefing" tall>
      <p className="mb-4 text-[0.9375rem] leading-relaxed text-text-muted">
        Everything discussed with everyone you know at one company, rolled into one briefing.
      </p>
      <Label>Company</Label>
      <Select
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value)
          briefing.reset()
        }}
      >
        <option value="">Select a company…</option>
        {multiContact.map((c) => (
          <option key={c.company} value={c.company}>
            {c.company} ({c.people.length} contacts)
          </option>
        ))}
      </Select>
      <Button
        variant="primary"
        size="lg"
        block
        className="mt-3"
        disabled={!selected || briefing.isPending}
        onClick={() => briefing.mutate(selected)}
      >
        {briefing.isPending ? 'Preparing…' : 'Get briefing'}
      </Button>
      {briefing.data && (
        <div className="prose-chat mt-4 rounded-2xl bg-bg-elevated p-4 text-[0.9375rem] leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.data.briefing}</ReactMarkdown>
        </div>
      )}
    </Sheet>
  )
}

export default function PeopleListPage() {
  const { data: people, isLoading, error } = usePeople()
  const { data: companies } = useCompanies()
  const [query, setQuery] = useState('')
  const [briefingOpen, setBriefingOpen] = useState(false)
  const usage = useUsageMode()

  // Only worth offering once there's actually more than one contact at
  // some company - a single-person "company" is just that person's own
  // briefing, already on their profile.
  // Company briefings are a work tool - not offered in Personal mode.
  const hasMultiContactCompany = usage.isWork && (companies ?? []).some((c) => c.people.length > 1)

  const filtered = (people ?? [])
    .filter((p) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return [p.name, p.role, p.company].some((field) => field?.toLowerCase().includes(q))
    })
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  // Contacts-app style A-Z sections.
  const groups: { letter: string; people: typeof filtered }[] = []
  for (const p of filtered) {
    const first = p.name.trim()[0]?.toUpperCase() ?? '#'
    const letter = /[A-Z]/.test(first) ? first : '#'
    const last = groups[groups.length - 1]
    if (last && last.letter === letter) last.people.push(p)
    else groups.push({ letter, people: [p] })
  }

  return (
    <div>
      <PageHeader
        title="People"
        subtitle={people && people.length > 0 ? `${people.length} ${people.length === 1 ? 'person' : 'people'}` : undefined}
        showProfile
      />

      {people && people.length > 0 && (
        // Sticky so search is always reachable on a long list - pinned to
        // the top of Layout's scroll area with the page ground behind it.
        <div className="sticky top-0 z-10 -mx-4 mb-3 bg-bg/95 px-4 py-2 backdrop-blur-xl">
          <div className="relative">
            <Search
              size={18}
              strokeWidth={2}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-faint"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, role or company"
              className="h-11 w-full rounded-xl bg-bg-elevated pr-10 pl-10 text-base text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/25 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-faint"
              >
                <X size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      )}

      {hasMultiContactCompany && !query && (
        <button
          type="button"
          onClick={() => setBriefingOpen(true)}
          className="pressable mb-5 flex w-full items-center gap-3 rounded-2xl border border-border bg-bg-card p-3.5 text-left"
        >
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Building2 size={20} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-semibold">Company briefing</span>
            <span className="block text-sm text-text-muted">Roll up everyone you know at one company</span>
          </span>
          <ChevronRight size={18} strokeWidth={2} className="text-text-faint" />
        </button>
      )}

      {error && <p className="text-sm text-danger">Couldn't load people: {String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!isLoading && people?.length === 0 && (
        <EmptyState
          title="No one here yet"
          body="Mention someone in a note on Home and they'll appear here with their full history."
          to="/"
          cta="Log a conversation"
        />
      )}
      {!isLoading && people && people.length > 0 && filtered.length === 0 && (
        <p className="py-10 text-center text-[0.9375rem] text-text-muted">No one matches “{query}”.</p>
      )}

      {groups.map(({ letter, people: group }) => (
        <section key={letter} className="mb-4">
          <h2 className="mb-1.5 px-1 text-[0.8125rem] font-semibold text-text-faint">{letter}</h2>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
            {group.map((p) => (
              <Link key={p.id} to={`/people/${p.id}`} className="pressable flex items-center gap-3 px-3.5 py-2.5">
                <Avatar id={p.id} name={p.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium">{p.name}</p>
                  {(p.role || p.company) && (
                    <p className="truncate text-sm text-text-muted">{[p.role, p.company].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
                <ChevronRight size={18} strokeWidth={2} className="flex-shrink-0 text-text-faint" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      {briefingOpen && <CompanyBriefingSheet onClose={() => setBriefingOpen(false)} />}
    </div>
  )
}
