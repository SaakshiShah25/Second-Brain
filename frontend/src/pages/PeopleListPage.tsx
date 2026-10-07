import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Users } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCompanies, useCompanyBriefing, useCompanyOverview, usePeople } from '../api/people'
import AiNotice from '../components/AiNotice'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import Card from '../components/Card'
import { Input, Label } from '../components/fields'
import PageIntro from '../components/PageIntro'

// Pick a company to see everyone you know there, how much you've talked to
// each of them, and your recent conversations - plain counts and dates -
// with the AI briefing as a separate on-demand step below it.
function CompanySection() {
  const { data: companies } = useCompanies()
  const [selected, setSelected] = useState('')
  const overview = useCompanyOverview(selected)
  const briefing = useCompanyBriefing()

  if (!companies || companies.length === 0) return null

  return (
    <Card className="mb-4">
      <Label>
        <span className="flex items-center gap-1.5">
          <Building2 size={13} strokeWidth={1.6} /> Companies
        </span>
      </Label>
      <p className="mb-2 text-xs text-text-muted">
        See everyone you know at a company and your conversations with them in one place.
      </p>
      <select
        id="company-select"
        aria-label="Company"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value)
          briefing.reset()
        }}
        className="w-full rounded-lg border border-border-strong bg-bg-card px-3 py-2 text-sm"
      >
        <option value="">Select a company…</option>
        {companies.map((c) => (
          <option key={c.company} value={c.company}>
            {c.company} ({c.people.length} {c.people.length === 1 ? 'contact' : 'contacts'})
          </option>
        ))}
      </select>

      {selected && overview.isLoading && <p className="mt-3 text-sm text-text-muted">Loading…</p>}
      {selected && overview.data && (
        <div className="mt-3 flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            <span className="font-medium text-text">
              {overview.data.people.length} {overview.data.people.length === 1 ? 'person' : 'people'}
            </span>
            {' · '}
            {overview.data.interaction_count} {overview.data.interaction_count === 1 ? 'interaction' : 'interactions'}
            {overview.data.last_interaction_date ? ` · last talked ${overview.data.last_interaction_date}` : ''}
          </p>

          <div>
            <p className="mb-1.5 text-xs font-medium text-text-muted">People</p>
            <ul className="flex flex-col gap-1">
              {overview.data.people.map((p) => (
                <li key={p.id}>
                  <Link to={`/people/${p.id}`} className="flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-bg-hover">
                    <Avatar id={p.id} name={p.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      {p.role && <span className="block truncate text-xs text-text-muted">{p.role}</span>}
                    </span>
                    <span className="flex-shrink-0 text-right text-xs text-text-faint">
                      {p.interaction_count} {p.interaction_count === 1 ? 'interaction' : 'interactions'}
                      {p.last_interaction_date && <span className="block">last {p.last_interaction_date}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {overview.data.recent_interactions.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-muted">Recent conversations</p>
              <ul className="flex flex-col gap-1.5">
                {overview.data.recent_interactions.map((i) => (
                  <li key={i.id} className="rounded-lg bg-bg-elevated px-3 py-2 text-xs text-text-muted">
                    <span className="font-medium text-text">{i.date ?? 'No date'}</span>
                    {' · '}
                    <Link to={`/people/${i.person.id}`} className="text-accent hover:underline">
                      {i.person.name}
                    </Link>
                    {i.summary && <p className="mt-0.5 leading-snug">{i.summary}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Button variant="primary" disabled={briefing.isPending} onClick={() => briefing.mutate(selected)}>
              {briefing.isPending ? 'Preparing…' : briefing.data ? 'Refresh briefing' : 'Get AI briefing'}
            </Button>
            {briefing.isError && (
              <p className="mt-2 text-xs text-danger">Couldn't prepare the briefing. Please try again in a moment.</p>
            )}
            {briefing.data && (
              <div className="mt-3 rounded-lg bg-accent-soft p-3">
                <div className="prose-chat min-w-0 text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.data.briefing}</ReactMarkdown>
                </div>
                <div className="mt-2 border-t border-border pt-2">
                  <AiNotice />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

export default function PeopleListPage() {
  const { data: people, isLoading, error } = usePeople()
  const [query, setQuery] = useState('')

  const filtered = (people ?? [])
    .filter((p) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return [p.name, p.role, p.company].some((field) => field?.toLowerCase().includes(q))
    })
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Users size={22} strokeWidth={1.6} className="text-accent" /> People
      </h1>
      <PageIntro>Everyone you've talked about, with their full history in one timeline.</PageIntro>

      <CompanySection />

      {people && people.length > 0 && (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, role, or company…"
          className="mb-4"
        />
      )}

      {error && <p className="text-sm text-danger">Couldn't load people: {String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!isLoading && people?.length === 0 && (
        <p className="text-sm text-text-muted">No one logged yet — log a note on the Chat page first.</p>
      )}
      {!isLoading && people && people.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-text-muted">No one matches "{query}".</p>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((p) => (
          <Link key={p.id} to={`/people/${p.id}`}>
            <Card className="flex items-center gap-3">
              <Avatar id={p.id} name={p.name} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}</p>
                {(p.role || p.company) && (
                  <p className="truncate text-xs text-text-muted">
                    {[p.role, p.company].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              <span className="text-text-faint">›</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
