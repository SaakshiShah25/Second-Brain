import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { useNotes } from '../api/notes'
import type { Interaction } from '../api/types'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import InitiativeBar from '../components/InitiativeBar'
import { InitiativeBlock, InitiativeView } from '../components/InitiativePage'
import InteractionCard from '../components/InteractionCard'
import PageHeader from '../components/PageHeader'
import { useConnection } from '../lib/connection'
import { useInitiativeFilter } from '../lib/initiativeFilter'

// Notes are organised by initiative, not by date: each initiative reads as
// one page (its points in sections). "All" shows a
// block per initiative; picking one opens its page. Searching shows the
// matching notes themselves.
export default function NotesPage() {
  const { data: notes, error, refetch, isFetching } = useNotes()
  const connection = useConnection()
  const offline = connection.offline || connection.unreachable
  const { data: initiatives } = useInitiatives()
  const [filter, setFilter] = useInitiativeFilter()
  const [query, setQuery] = useState('')
  // ?open=<note id> (from a task's "View the note") opens that note straight away.
  const [searchParams, setSearchParams] = useSearchParams()
  const openNote = notes?.find((n) => n.id === (Number(searchParams.get('open')) || -1)) ?? null

  // Notes grouped by initiative id, 0 = Others.
  const groups = useMemo(() => {
    const map = new Map<number, { notes: Interaction[] }>()
    for (const n of notes ?? []) {
      const id = n.initiative_id ?? 0
      ;(map.get(id) ?? map.set(id, { notes: [] }).get(id)!).notes.push(n)
    }
    return map
  }, [notes])

  const counts = useMemo(() => {
    const map = new Map<number, number>()
    for (const [id, g] of groups) if (g.notes.length) map.set(id === 0 ? -1 : id, g.notes.length)
    return map
  }, [groups])

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
  const empty = { notes: [] as Interaction[] }

  return (
    <div>
      <PageHeader title="Notes" showProfile />

      {openNote && (
        // The note's sheet floats above the page, so the card itself can stay out of sight.
        <div hidden>
          <InteractionCard
            key={openNote.id}
            interaction={openNote}
            autoOpen
            onClosed={() =>
              setSearchParams(
                (prev) => {
                  prev.delete('open')
                  return prev
                },
                { replace: true },
              )
            }
          />
        </div>
      )}

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

      {!notes && (
        <div className="py-8 text-center">
          {error ? (
            <>
              <p className="mb-3 text-[0.9375rem] text-text-muted">
                {offline ? "You're offline, so your notes can't load right now." : "Couldn't load your notes."}
              </p>
              <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? 'Trying…' : 'Try again'}
              </Button>
            </>
          ) : (
            <p className="text-[0.9375rem] text-text-muted">
              {offline ? "You're offline. Your notes will appear when you're back online." : 'Loading…'}
            </p>
          )}
        </div>
      )}
      {notes?.length === 0 && (
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
              <InteractionCard key={n.id} interaction={n} />
            ))}
          </div>
        </>
      ) : focusId !== null ? (
        <InitiativeView
          key={focusId}
          id={focusId}
          initiative={focusInitiative}
          notes={(groups.get(focusId) ?? empty).notes}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {blocks.map((b) => (
            <InitiativeBlock
              key={b.id}
              id={b.id}
              initiative={b.initiative}
              notes={groups.get(b.id)!.notes}
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
