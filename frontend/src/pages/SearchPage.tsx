import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Circle, FileText, Search as SearchIcon, X } from 'lucide-react'
import { useNotes } from '../api/notes'
import { usePeople } from '../api/people'
import { useTasks } from '../api/tasks'
import ContactRow from '../components/ContactRow'
import Highlight from '../components/Highlight'
import { normalize, searchNotes, searchPeople, searchTasks, snippet, tokenize } from '../lib/search'

const PAGE_SIZE = 6

// One search box over everything: contacts, notes and tasks - laid out like a
// command palette. Results sit in one panel under small group labels, arrow
// keys move through them, and Enter opens the highlighted one.

interface Result {
  key: string
  active: boolean
  onHover: () => void
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">{children}</h2>
  )
}

function ResultRow({
  to,
  active,
  onHover,
  icon,
  children,
}: {
  to: string
  active: boolean
  onHover: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      onMouseEnter={onHover}
      data-search-active={active}
      className={`flex items-start gap-3 px-3 py-2.5 transition-colors ${active ? 'bg-accent-soft' : 'hover:bg-bg-hover'}`}
    >
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center text-text-faint">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </Link>
  )
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const terms = tokenize(deferredQuery)
  const [activeIndex, setActiveIndex] = useState(0)
  const [limits, setLimits] = useState({ people: PAGE_SIZE, notes: PAGE_SIZE, tasks: PAGE_SIZE })
  const panelRef = useRef<HTMLDivElement>(null)

  const { data: people, isLoading: peopleLoading } = usePeople()
  const { data: notes, isLoading: notesLoading } = useNotes()
  const { data: taskData, isLoading: tasksLoading } = useTasks('all')
  const loading = peopleLoading || notesLoading || tasksLoading
  const hasQuery = terms.length > 0

  const peopleHits = useMemo(() => searchPeople(people ?? [], terms), [people, deferredQuery]) // eslint-disable-line react-hooks/exhaustive-deps
  const noteHits = useMemo(() => searchNotes(notes ?? [], terms), [notes, deferredQuery]) // eslint-disable-line react-hooks/exhaustive-deps
  const taskHits = useMemo(() => searchTasks(taskData?.tasks ?? [], terms), [taskData, deferredQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  const shownPeople = peopleHits.slice(0, limits.people)
  const shownNotes = noteHits.slice(0, limits.notes)
  const shownTasks = taskHits.slice(0, limits.tasks)
  const typed = deferredQuery.trim()

  // Every selectable row, in on-screen order, for keyboard navigation.
  const targets: { href: string }[] = [
    ...shownPeople.map((p) => ({ href: `/people/${p.id}` })),
    ...shownNotes.map((n) => ({ href: n.person ? `/people/${n.person.id}` : '/notes' })),
    ...shownTasks.map((t) => ({ href: (t.person ?? t.interaction?.person) ? `/people/${(t.person ?? t.interaction?.person)!.id}` : '/digest' })),
  ]

  // Keep the highlight valid as results change, and scrolled into view.
  useEffect(() => {
    setActiveIndex(0)
  }, [deferredQuery])
  useEffect(() => {
    panelRef.current?.querySelector('[data-search-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (targets.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % targets.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + targets.length) % targets.length)
    } else if (e.key === 'Enter') {
      const target = targets[Math.min(activeIndex, targets.length - 1)]
      if (target) navigate(target.href)
    } else if (e.key === 'Escape') {
      setQuery('')
    }
  }

  const row = (index: number): Result => ({
    key: String(index),
    active: index === activeIndex,
    onHover: () => setActiveIndex(index),
  })

  let cursor = 0 // running index of the next selectable row
  const nextRow = () => row(cursor++)

  const total = peopleHits.length + noteHits.length + taskHits.length

  return (
    <div>
      {/* mr-12 leaves room for the Help button that floats in the top-right corner of every screen */}
      <div className="relative mb-3 mr-12">
        <SearchIcon
          size={18}
          strokeWidth={1.6}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-faint"
        />
        <input
          id="global-search"
          // type="text", not "search": the browser's built-in clear (x) for a
          // search box is drawn in a fixed blue that vanishes on the dark theme.
          // This page draws its own, in the theme's colours (below).
          type="text"
          inputMode="search"
          autoComplete="off"
          autoFocus
          aria-label="Search contacts, notes and tasks"
          placeholder="Search contacts, notes and tasks…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setLimits({ people: PAGE_SIZE, notes: PAGE_SIZE, tasks: PAGE_SIZE })
          }}
          onKeyDown={handleKeyDown}
          className="w-full rounded-xl border border-border-strong bg-bg-card py-3.5 pl-11 pr-11 text-base text-text placeholder:text-text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              document.getElementById('global-search')?.focus()
            }}
            aria-label="Clear search"
            title="Clear"
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
          >
            <X size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      {!hasQuery && (
        <p className="px-1 text-sm text-text-muted">
          Find anything you've logged - a contact, a company, a word from a note, a follow-up. Every word you type has to
          match. Use <kbd className="rounded border border-border-strong px-1 text-xs">↑</kbd>{' '}
          <kbd className="rounded border border-border-strong px-1 text-xs">↓</kbd> to move and{' '}
          <kbd className="rounded border border-border-strong px-1 text-xs">Enter</kbd> to open.
        </p>
      )}
      {hasQuery && loading && <p className="px-1 text-sm text-text-muted">Searching…</p>}

      {hasQuery && !loading && (
        <div ref={panelRef} className="overflow-hidden rounded-xl border border-border bg-bg-card pb-1">
          {total === 0 && (
            <p className="px-3 pt-3 text-sm text-text-muted">
              Nothing matches “{typed}”. Try fewer or shorter words. To ask a question in plain language, use the Chat tab.
            </p>
          )}

          {shownPeople.length > 0 && (
            <>
              <GroupLabel>Contacts</GroupLabel>
              {shownPeople.map((p) => {
                const r = nextRow()
                return (
                  <div key={p.id} data-search-active={r.active}>
                    <ContactRow person={p} terms={terms} active={r.active} onHover={r.onHover} />
                  </div>
                )
              })}
              {peopleHits.length > shownPeople.length && (
                <button
                  type="button"
                  onClick={() => setLimits((l) => ({ ...l, people: l.people + PAGE_SIZE }))}
                  className="px-3 py-1.5 text-sm text-accent hover:underline"
                >
                  Show {Math.min(PAGE_SIZE, peopleHits.length - shownPeople.length)} more contacts
                </button>
              )}
            </>
          )}

          {shownNotes.length > 0 && (
            <>
              <GroupLabel>Notes</GroupLabel>
              {shownNotes.map((n) => {
                const r = nextRow()
                const body = n.raw_text ?? ''
                // Show why it matched when the hit isn't already in the summary.
                const summaryNorm = normalize(n.summary ?? '')
                const bodyNorm = normalize(body)
                const showSnippet =
                  !terms.every((t) => summaryNorm.includes(t)) && terms.some((t) => bodyNorm.includes(t))
                return (
                  <ResultRow
                    key={n.id}
                    to={n.person ? `/people/${n.person.id}` : '/notes'}
                    active={r.active}
                    onHover={r.onHover}
                    icon={<FileText size={15} strokeWidth={1.6} />}
                  >
                    <p className="line-clamp-2 text-sm text-text">
                      <Highlight text={n.summary || body || '(no summary)'} terms={terms} />
                    </p>
                    {showSnippet && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">
                        <Highlight text={snippet(body, terms)} terms={terms} />
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-text-faint">
                      {[n.date ?? 'No date', n.person?.name ?? 'Personal'].join(' · ')}
                    </p>
                  </ResultRow>
                )
              })}
              {noteHits.length > shownNotes.length && (
                <button
                  type="button"
                  onClick={() => setLimits((l) => ({ ...l, notes: l.notes + PAGE_SIZE }))}
                  className="px-3 py-1.5 text-sm text-accent hover:underline"
                >
                  Show {Math.min(PAGE_SIZE, noteHits.length - shownNotes.length)} more notes
                </button>
              )}
            </>
          )}

          {shownTasks.length > 0 && (
            <>
              <GroupLabel>Tasks</GroupLabel>
              {shownTasks.map((t) => {
                const r = nextRow()
                const person = t.person ?? t.interaction?.person ?? null
                const done = t.status === 'done'
                return (
                  <ResultRow
                    key={t.id}
                    to={person ? `/people/${person.id}` : '/digest'}
                    active={r.active}
                    onHover={r.onHover}
                    icon={
                      done ? (
                        <CheckCircle2 size={16} strokeWidth={1.6} className="text-success" />
                      ) : (
                        <Circle size={16} strokeWidth={1.6} />
                      )
                    }
                  >
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
                  </ResultRow>
                )
              })}
              {taskHits.length > shownTasks.length && (
                <button
                  type="button"
                  onClick={() => setLimits((l) => ({ ...l, tasks: l.tasks + PAGE_SIZE }))}
                  className="px-3 py-1.5 text-sm text-accent hover:underline"
                >
                  Show {Math.min(PAGE_SIZE, taskHits.length - shownTasks.length)} more tasks
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
