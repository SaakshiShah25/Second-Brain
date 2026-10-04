import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ListTree, NotebookText } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { useNotes } from '../api/notes'
import InitiativesManager from '../components/InitiativesManager'
import InteractionCard from '../components/InteractionCard'
import { getInitiativeStyle } from '../lib/initiativeStyle'

// null = "All", -1 = "Uncategorized" (sentinel, since real initiative ids
// are always positive), else a real initiative id.
type FilterValue = null | -1 | number

type Tab = 'notes' | 'initiatives'

export default function NotesPage() {
  const { data: notes, isLoading, error } = useNotes()
  const { data: initiatives } = useInitiatives()
  const [filter, setFilter] = useState<FilterValue>(null)

  // ?tab=initiatives deep-links straight to the Initiatives tab - used by
  // the onboarding tour (Tour.tsx navigates here for its Initiatives
  // step) so it can point at the real tab instead of just describing it,
  // but works for anyone bookmarking/sharing the link too.
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'initiatives' ? 'initiatives' : 'notes')
  useEffect(() => {
    setTab(searchParams.get('tab') === 'initiatives' ? 'initiatives' : 'notes')
  }, [searchParams])

  // If the initiative currently selected as a filter gets deleted (from
  // the Initiatives tab), fall back to "All" instead of silently staying
  // pointed at an id that no longer exists - without this, every note
  // would appear to vanish ("No notes match this filter") with no chip
  // even highlighted to explain why, since the deleted initiative's chip
  // is gone too.
  useEffect(() => {
    if (typeof filter === 'number' && filter > 0 && initiatives && !initiatives.some((i) => i.id === filter)) {
      setFilter(null)
    }
  }, [initiatives, filter])

  const visibleNotes = (notes ?? []).filter((n) => {
    if (filter === null) return true
    if (filter === -1) return n.initiative_id === null
    return n.initiative_id === filter
  })

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <NotebookText size={22} strokeWidth={1.6} className="text-accent" /> Notes
      </h1>

      {/* Initiatives moved here from Settings - this is where you're
          actually filtering/thinking about them, not a one-time config
          screen you'd otherwise have to remember to go find. */}
      <div className="mb-4 flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setTab('notes')}
          className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'notes' ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          All Notes
        </button>
        <button
          type="button"
          onClick={() => setTab('initiatives')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === 'initiatives' ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <ListTree size={14} strokeWidth={1.6} />
          Initiatives
        </button>
      </div>

      {tab === 'initiatives' ? (
        <InitiativesManager />
      ) : (
        <>
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
        {initiatives?.map((i) => {
          const catStyle = getInitiativeStyle(i)
          const active = filter === i.id
          return (
            <button
              key={i.id}
              onClick={() => setFilter(i.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                active ? '' : 'border-border-strong bg-bg-card text-text-muted hover:text-text'
              }`}
              style={
                active && catStyle
                  ? { borderColor: catStyle.color, backgroundColor: `${catStyle.color}1a`, color: catStyle.color }
                  : undefined
              }
            >
              {catStyle && <catStyle.Icon size={13} strokeWidth={1.8} />}
              {i.name}
            </button>
          )
        })}
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
        </>
      )}
    </div>
  )
}
