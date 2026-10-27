import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { useNotes } from '../api/notes'
import { useTasks } from '../api/tasks'
import type { Interaction, Task } from '../api/types'
import EmptyState from '../components/EmptyState'
import InitiativeBar from '../components/InitiativeBar'
import { InitiativeBlock, InitiativeView } from '../components/InitiativePage'
import InteractionCard from '../components/InteractionCard'
import PageHeader from '../components/PageHeader'
import { useInitiativeFilter } from '../lib/initiativeFilter'

// Notes are organised by initiative, not by date: each initiative reads as
// one page (summary, its points in sections, all its tasks). "All" shows a
// block per initiative; picking one opens its page. Searching shows the
// matching notes themselves.
export default function NotesPage() {
  const { data: notes, isLoading, error } = useNotes()
  const { data: initiatives } = useInitiatives()
  const { data: taskData } = useTasks('all')
  const [filter, setFilter] = useInitiativeFilter()
  const [query, setQuery] = useState('')

  // Everything grouped by initiative id, 0 = Others.
  const groups = useMemo(() => {
    const map = new Map<number, { notes: Interaction[]; tasks: Task[] }>()
    const get = (id: number) => map.get(id) ?? map.set(id, { notes: [], tasks: [] }).get(id)!
    for (const n of notes ?? []) {
      get(n.initiative_id ?? 0).notes.push(n)
    }
    for (const t of taskData?.tasks ?? []) {
      get(t.interaction?.initiative?.id ?? 0).tasks.push(t)
    }
    return map
  }, [notes, taskData])

  const counts = useMemo(() => {
    const map = new Map<number, number>()
    for (const [id, g] of groups) if (g.notes.length) map.set(id === 0 ? -1 : id, g.notes.length)
    return map
  }, [groups])

  const tasksByNote = useMemo(() => {
    const map = new Map<number, Task[]>()
    for (const t of taskData?.tasks ?? []) map.set(t.interaction_id, [...(map.get(t.interaction_id) ?? []), t])
    return map
  }, [taskData])

  const q = query.trim().toLowerCase()
  const searchResults = q
    ? (notes ?? []).filter((n) => [n.summary, n.raw_text, n.initiative?.name].some((f) => f?.toLowerCase().includes(q)))
    : []

  // Initiatives with something in them, in the user's own order; Others last.
  const blocks = [
    ...(initiatives ?? []).filter((i) => groups.get(i.id)).map((i) => ({ id: i.id, initiative: i })),
    ...(groups.get(0)?.notes.length ? [{ id: 0, initiative: null }] : []),
  ]

  const focusId = filter === null ? null : filter === -1 ? 0 : filter
  const focusInitiative = focusId ? initiatives?.find((i) => i.id === focusId) ?? null : null
  const empty = { notes: [], tasks: [] }

  return (
    <div>
      <PageHeader title="Notes" showProfile />

      {notes && notes.length > 0 && (
        <div className="relative mb-3">
          <Search size={18} strokeWidth={2} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes"
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
      )}

      {!q && <InitiativeBar counts={counts} className="mb-4" />}

      {error && <p className="text-sm text-danger">Couldn't load notes: {String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!isLoading && notes?.length === 0 && (
        <EmptyState
          title="No notes yet"
          body="Head to Home and jot something down — it's filed under its initiative, with any tasks ready to tick."
          to="/"
          cta="Log your first note"
        />
      )}

      {q ? (
        <>
          {searchResults.length === 0 && (
            <p className="py-10 text-center text-[0.9375rem] text-text-muted">No notes match “{query}”.</p>
          )}
          <div className="flex flex-col gap-2.5">
            {searchResults.map((n) => (
              <InteractionCard key={n.id} interaction={n} tasks={tasksByNote.get(n.id)} />
            ))}
          </div>
        </>
      ) : focusId !== null ? (
        <InitiativeView
          key={focusId}
          id={focusId}
          initiative={focusInitiative}
          notes={(groups.get(focusId) ?? empty).notes}
          tasks={(groups.get(focusId) ?? empty).tasks}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {blocks.map((b) => (
            <InitiativeBlock
              key={b.id}
              id={b.id}
              initiative={b.initiative}
              notes={groups.get(b.id)!.notes}
              tasks={groups.get(b.id)!.tasks}
              onOpen={() => {
                setFilter(b.id === 0 ? -1 : b.id)
                document.getElementById('app-scroll')?.scrollTo({ top: 0 })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
