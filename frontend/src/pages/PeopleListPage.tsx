import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Users } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCompanies, useCompanyBriefing, usePeople } from '../api/people'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import Card from '../components/Card'
import SpeakButton from '../components/SpeakButton'
import { Input, Label } from '../components/fields'

function CompanyBriefingSection() {
  const { data: companies } = useCompanies()
  const [selected, setSelected] = useState('')
  const briefing = useCompanyBriefing()

  // Only worth surfacing once there's actually more than one contact
  // somewhere to roll up - a single-person "company" is just that
  // person's own briefing, already one click away on their profile.
  const multiContact = (companies ?? []).filter((c) => c.people.length > 1)
  if (multiContact.length === 0) return null

  return (
    <Card className="mb-4">
      <Label>
        <span className="flex items-center gap-1.5">
          <Building2 size={13} strokeWidth={2} /> Company briefing
        </span>
      </Label>
      <p className="mb-2 text-xs text-text-muted">
        Roll up everything discussed with everyone you've talked to at one company - no need to open
        each contact's profile separately.
      </p>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value)
            briefing.reset()
          }}
          className="flex-1 rounded-lg border border-border-strong bg-bg-card px-3 py-2 text-sm"
        >
          <option value="">Select a company…</option>
          {multiContact.map((c) => (
            <option key={c.company} value={c.company}>
              {c.company} ({c.people.length} contacts)
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          disabled={!selected || briefing.isPending}
          onClick={() => briefing.mutate(selected)}
        >
          {briefing.isPending ? 'Preparing…' : 'Get briefing'}
        </Button>
      </div>
      {briefing.data && (
        <div className="mt-3 flex items-start justify-between gap-2 rounded-lg bg-accent-soft p-3">
          <div className="prose-chat min-w-0 flex-1 text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.data.briefing}</ReactMarkdown>
          </div>
          <SpeakButton text={briefing.data.briefing} />
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
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold">
        <Users size={22} strokeWidth={2} className="text-accent" /> People
      </h1>

      <CompanyBriefingSection />

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
