import { useState } from 'react'
import { NotebookText } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { useNotes } from '../api/notes'
import InteractionCard from '../components/InteractionCard'

// null = "All", -1 = "Uncategorized" (sentinel, since real initiative ids
// are always positive), else a real initiative id.
type FilterValue = null | -1 | number

export default function NotesPage() {
  const { data: notes, isLoading, error } = useNotes()
  const { data: initiatives } = useInitiatives()
  const [filter, setFilter] = useState<FilterValue>(null)

  const visibleNotes = (notes ?? []).filter((n) => {
    if (filter === null) return true
    if (filter === -1) return n.initiative_id === null
    return n.initiative_id === filter
  })

  return (
    <div>
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <NotebookText size={22} strokeWidth={2} className="text-accent" /> Notes
      </h1>

      {/* Client-side filtering - a personal-scale dataset and a handful
          of initiatives, not worth a server round-trip per chip click. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter(null)}
          className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
            filter === null
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-border-strong bg-bg-card text-text-muted hover:text-text'
          }`}
        >
          All
        </button>
        {initiatives?.map((i) => (
          <button
            key={i.id}
            onClick={() => setFilter(i.id)}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              filter === i.id
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border-strong bg-bg-card text-text-muted hover:text-text'
            }`}
          >
            {i.name}
          </button>
        ))}
        {/* Uncategorized is a first-class, always-present filter - every
            pre-migration note (and anything the classifier wasn't
            confident about) lives here, not an edge case. */}
        <button
          onClick={() => setFilter(-1)}
          className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
            filter === -1
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-border-strong bg-bg-card text-text-muted hover:text-text'
          }`}
        >
          Uncategorized
        </button>
      </div>

      {error && <p className="text-sm text-danger">Couldn't load notes: {String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!isLoading && notes?.length === 0 && (
        <p className="text-sm text-text-muted">Nothing logged yet — log a note on the Chat page first.</p>
      )}
      {!isLoading && notes && notes.length > 0 && visibleNotes.length === 0 && (
        <p className="text-sm text-text-muted">No notes match this filter.</p>
      )}

      <div className="flex flex-col gap-2">
        {visibleNotes.map((note) => (
          <InteractionCard key={note.id} interaction={note} />
        ))}
      </div>
    </div>
  )
}
