import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { useNotes } from '../api/notes'
import Chip, { ChipRow } from '../components/Chip'
import EmptyState from '../components/EmptyState'
import InitiativesManager from '../components/InitiativesManager'
import InteractionCard from '../components/InteractionCard'
import PageHeader from '../components/PageHeader'
import Segmented from '../components/Segmented'
import { groupByInitiative } from '../lib/groupByInitiative'
import { getInitiativeStyle } from '../lib/initiativeStyle'

// null = "All", -1 = "Uncategorized" (sentinel, since real initiative ids
// are always positive), else a real initiative id.
type FilterValue = null | -1 | number

type Tab = 'notes' | 'initiatives'

export default function NotesPage() {
  const { data: notes, isLoading, error } = useNotes()
  const { data: initiatives } = useInitiatives()
  const [filter, setFilter] = useState<FilterValue>(null)
  const [query, setQuery] = useState('')

  // ?tab=initiatives deep-links straight to the Initiatives view - used
  // by the onboarding tour (Tour.tsx) so it can show the real screen.
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'initiatives' ? 'initiatives' : 'notes')
  useEffect(() => {
    setTab(searchParams.get('tab') === 'initiatives' ? 'initiatives' : 'notes')
  }, [searchParams])

  // If the initiative selected as a filter gets deleted, fall back to
  // "All" instead of silently filtering on an id that no longer exists.
  useEffect(() => {
    if (typeof filter === 'number' && filter > 0 && initiatives && !initiatives.some((i) => i.id === filter)) {
      setFilter(null)
    }
  }, [initiatives, filter])

  // Client-side filtering + search - a personal-scale dataset, not worth
  // a server round-trip per keystroke or chip tap.
  const visibleNotes = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (notes ?? []).filter((n) => {
      if (filter === -1 && n.initiative_id !== null) return false
      if (typeof filter === 'number' && filter > 0 && n.initiative_id !== filter) return false
      if (!q) return true
      return [n.summary, n.raw_text, n.initiative?.name].some((f) => f?.toLowerCase().includes(q))
    })
  }, [notes, filter, query])

  // Under their category (in the order the categories are listed), newest note first.
  const sections = groupByInitiative(
    visibleNotes.slice().sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id),
    initiatives ?? [],
    (n) => n.initiative_id,
  )

  return (
    <div>
      <PageHeader title="Notes" showProfile />

      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'notes', label: 'All notes' },
          { value: 'initiatives', label: 'Initiatives' },
        ]}
      />

      {tab === 'initiatives' ? (
        <InitiativesManager />
      ) : (
        <>
          {notes && notes.length > 0 && (
            <div className="relative mb-3">
              <Search
                size={18}
                strokeWidth={2}
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-faint"
              />
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

          <ChipRow className="mb-5">
            <Chip active={filter === null} onClick={() => setFilter(null)}>
              All
            </Chip>
            {initiatives?.map((i) => {
              const catStyle = getInitiativeStyle(i)
              return (
                <Chip key={i.id} active={filter === i.id} color={catStyle?.color} onClick={() => setFilter(i.id)}>
                  {catStyle && <catStyle.Icon size={14} strokeWidth={2} />}
                  {i.name}
                </Chip>
              )
            })}
            {/* Uncategorized is a first-class filter - every pre-migration
                note (and anything the classifier wasn't sure about) lives
                here, not an edge case. */}
            <Chip active={filter === -1} onClick={() => setFilter(-1)}>
              Others
            </Chip>
          </ChipRow>

          {error && <p className="text-sm text-danger">Couldn't load notes: {String(error)}</p>}
          {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
          {!isLoading && notes?.length === 0 && (
            <EmptyState
              title="No notes yet"
              body="Head to Home and jot something down — it'll show up here, sorted and summarised."
              to="/"
              cta="Log your first note"
            />
          )}
          {!isLoading && notes && notes.length > 0 && visibleNotes.length === 0 && (
            <p className="py-10 text-center text-[0.9375rem] text-text-muted">
              {query ? `No notes match “${query}”.` : 'No notes in this category yet.'}
            </p>
          )}

          {sections.map(({ key, name, initiative, items }) => {
            const style = getInitiativeStyle(initiative)
            return (
              <section key={key} className="mb-5">
                <h2
                  className="mb-2 flex items-center gap-1.5 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint"
                  style={style ? { color: style.color } : undefined}
                >
                  {style && <style.Icon size={14} strokeWidth={2.2} />}
                  {name}
                  <span className="font-medium normal-case tracking-normal opacity-80">· {items.length}</span>
                </h2>
                <div className="flex flex-col gap-2.5">
                  {items.map((note) => (
                    <InteractionCard key={note.id} interaction={note} />
                  ))}
                </div>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
