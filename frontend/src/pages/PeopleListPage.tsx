import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { usePeople } from '../api/people'
import Avatar from '../components/Avatar'
import Card from '../components/Card'
import { Input } from '../components/fields'

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
