import { useDeferredValue, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Search as SearchIcon } from 'lucide-react'
import { useNotes } from '../api/notes'
import { usePeople } from '../api/people'
import { useTasks } from '../api/tasks'
import Avatar from '../components/Avatar'
import Card from '../components/Card'
import InteractionCard from '../components/InteractionCard'
import { Input } from '../components/fields'
import { normalize, searchNotes, searchPeople, searchTasks, snippet, tokenize } from '../lib/search'

const PAGE_SIZE = 8

// Wraps every occurrence of a search term in <mark>. Built from the raw
// terms (case-insensitive) rather than the accent-stripped ones, so the
// highlight always lines up with the text as it's actually written.
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-accent-soft px-0.5 text-text">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

function Section({
  title,
  count,
  shown,
  onMore,
  children,
}: {
  title: string
  count: number
  shown: number
  onMore: () => void
  children: ReactNode
}) {
  if (count === 0) return null
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold tracking-tight text-text-muted">
        {title} <span className="font-normal text-text-faint">({count})</span>
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
      {count > shown && (
        <button type="button" onClick={onMore} className="mt-2 text-sm text-accent hover:underline">
          Show {Math.min(PAGE_SIZE, count - shown)} more
        </button>
      )}
    </section>
  )
}

// One search box over everything: people, notes and tasks. Typing "pricing"
// finds the contact who was skeptical about it, the notes that mention it
// and the follow-up you wrote about it, together.
export default function SearchPage() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const terms = tokenize(deferredQuery)

  const { data: people, isLoading: peopleLoading } = usePeople()
  const { data: notes, isLoading: notesLoading } = useNotes()
  const { data: taskData, isLoading: tasksLoading } = useTasks('all')
  const loading = peopleLoading || notesLoading || tasksLoading

  const [limits, setLimits] = useState({ people: PAGE_SIZE, notes: PAGE_SIZE, tasks: PAGE_SIZE })
  const more = (key: keyof typeof limits) => setLimits((l) => ({ ...l, [key]: l[key] + PAGE_SIZE }))

  const peopleHits = searchPeople(people ?? [], terms)
  const noteHits = searchNotes(notes ?? [], terms)
  const taskHits = searchTasks(taskData?.tasks ?? [], terms)
  const total = peopleHits.length + noteHits.length + taskHits.length
  const hasQuery = terms.length > 0

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <SearchIcon size={22} strokeWidth={1.6} className="text-accent" /> Search
      </h1>

      <Input
        id="global-search"
        type="search"
        autoFocus
        aria-label="Search people, notes and tasks"
        placeholder="Search people, notes and tasks…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setLimits({ people: PAGE_SIZE, notes: PAGE_SIZE, tasks: PAGE_SIZE })
        }}
        className="mb-5 w-full"
      />

      {!hasQuery && (
        <p className="text-sm text-text-muted">
          Find anything you've logged - a person, a company, a word from a note, a follow-up. Every word you type has
          to match.
        </p>
      )}
      {hasQuery && loading && <p className="text-sm text-text-muted">Searching…</p>}
      {hasQuery && !loading && total === 0 && (
        <Card>
          <p className="text-sm text-text">Nothing matches “{deferredQuery.trim()}”.</p>
          <p className="mt-1 text-xs text-text-muted">
            Try fewer or shorter words. To ask a question in plain language instead, use the Chat tab.
          </p>
        </Card>
      )}

      {hasQuery && (
        <>
          <Section title="People" count={peopleHits.length} shown={limits.people} onMore={() => more('people')}>
            {peopleHits.slice(0, limits.people).map((p) => (
              <Link key={p.id} to={`/people/${p.id}`}>
                <Card className="flex items-center gap-3">
                  <Avatar id={p.id} name={p.name} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      <Highlight text={p.name} terms={terms} />
                    </p>
                    {[p.role, p.company].filter(Boolean).length > 0 && (
                      <p className="truncate text-xs text-text-muted">
                        <Highlight text={[p.role, p.company].filter(Boolean).join(', ')} terms={terms} />
                      </p>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </Section>

          <Section title="Notes" count={noteHits.length} shown={limits.notes} onMore={() => more('notes')}>
            {noteHits.slice(0, limits.notes).map((n) => {
              // Show why it matched when the hit isn't already visible in
              // the one-line summary the card displays - i.e. it's down in
              // the original note text.
              const body = n.raw_text ?? ''
              const summaryNorm = normalize(n.summary ?? '')
              const bodyNorm = normalize(body)
              const showSnippet =
                !terms.every((t) => summaryNorm.includes(t)) && terms.some((t) => bodyNorm.includes(t))
              return (
                <div key={n.id}>
                  <InteractionCard interaction={n} />
                  {showSnippet && (
                    <p className="mt-1 px-1 text-xs text-text-faint">
                      <Highlight text={snippet(body, terms)} terms={terms} />
                    </p>
                  )}
                </div>
              )
            })}
          </Section>

          <Section title="Tasks" count={taskHits.length} shown={limits.tasks} onMore={() => more('tasks')}>
            {taskHits.slice(0, limits.tasks).map((t) => {
              const person = t.person ?? t.interaction?.person ?? null
              const done = t.status === 'done'
              return (
                <Link key={t.id} to={person ? `/people/${person.id}` : '/digest'}>
                  <Card className="flex items-start gap-3">
                    {done ? (
                      <CheckCircle2 size={18} strokeWidth={1.6} className="mt-0.5 flex-shrink-0 text-success" />
                    ) : (
                      <Circle size={18} strokeWidth={1.6} className="mt-0.5 flex-shrink-0 text-text-faint" />
                    )}
                    <div className="min-w-0">
                      <p className={`text-sm ${done ? 'text-text-muted line-through' : 'text-text'}`}>
                        <Highlight text={t.description} terms={terms} />
                      </p>
                      <p className="mt-0.5 text-xs text-text-faint">
                        {[
                          person?.name ?? t.interaction?.initiative?.name ?? 'Personal',
                          t.due_date ? `due ${t.due_date}` : 'no due date',
                          done ? 'done' : 'open',
                        ].join(' · ')}
                      </p>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </Section>
        </>
      )}
    </div>
  )
}
