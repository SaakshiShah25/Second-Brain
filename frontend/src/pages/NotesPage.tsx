import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronRight, Search, X } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { useNotes } from '../api/notes'
import { useLists } from '../api/lists'
import { useTasks, useUpdateTaskStatus } from '../api/tasks'
import type { Interaction, ItemList, Task } from '../api/types'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import InitiativeBar from '../components/InitiativeBar'
import { InitiativeBlock, InitiativeView } from '../components/InitiativePage'
import ItemRow from '../components/ItemRow'
import ItemSheet from '../components/ItemSheet'
import InteractionCard from '../components/InteractionCard'
import PageHeader from '../components/PageHeader'
import { useConnection } from '../lib/connection'
import { useInitiativeFilter } from '../lib/initiativeFilter'
import { getInitiativeStyle } from '../lib/initiativeStyle'
import { matchesAll, rank, tokens } from '../lib/search'
import { taskInitiativeId } from '../lib/taskOptions'

// Spaces: everything is organised by initiative (a "space"), not by date - its notes, to-dos and things
// it collects. Each space reads as
// one page (its points in sections). "All" shows a
// block per initiative; picking one opens its page. Searching shows the
// matching notes themselves.
export default function NotesPage() {
  const { data: notes, error, refetch, isFetching } = useNotes()
  const connection = useConnection()
  const offline = connection.offline || connection.unreachable
  const { data: initiatives } = useInitiatives()
  const { data: taskData } = useTasks('all')
  const { data: allLists } = useLists()
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

  // The to-dos and list entries that belong to each initiative (0 = Others) - the other half of what it holds.
  const itemGroups = useMemo(() => {
    const map = new Map<number, Task[]>()
    for (const t of taskData?.tasks ?? []) {
      // Everything, ticked or not: a to-do you just ticked has to stay on screen (struck through) until it is swiped
      // away, and the space page itself decides what to show. Counts below only count what is still open.
      const id = taskInitiativeId(t) ?? 0
      ;(map.get(id) ?? map.set(id, []).get(id)!).push(t)
    }
    return map
  }, [taskData])

  const counts = useMemo(() => {
    const map = new Map<number, number>()
    const ids = new Set([...groups.keys(), ...itemGroups.keys()])
    for (const id of ids) {
      const n = (groups.get(id)?.notes.length ?? 0) + (itemGroups.get(id)?.filter((t) => t.status === 'open').length ?? 0)
      if (n) map.set(id === 0 ? -1 : id, n)
    }
    return map
  }, [groups, itemGroups])

  const q = query.trim()
  const words = tokens(query)
  const spaceName = (id: number | null | undefined) => (id ? (initiatives ?? []).find((i) => i.id === id)?.name : 'Others')
  // Everything the search looks through: space names, list names (and the space they sit in), to-dos and list
  // entries (their wording, detail, list and space), and notes (summary, full text, space).
  const spaceHits = words.length
    ? (initiatives ?? []).filter((i) => matchesAll(words, [i.name])).sort((a, b) => rank(words, b.name) - rank(words, a.name))
    : []
  const listHits = words.length
    ? (allLists ?? []).filter((l) => matchesAll(words, [l.name, spaceName(l.initiative_id)])).sort((a, b) => rank(words, b.name) - rank(words, a.name))
    : []
  const itemHits = words.length
    ? (taskData?.tasks ?? [])
        .filter((t) => matchesAll(words, [t.description, t.detail, t.item_list?.name, spaceName(taskInitiativeId(t))]))
        .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || rank(words, b.description) - rank(words, a.description))
    : []
  const searchResults = words.length
    ? (notes ?? []).filter((n) => matchesAll(words, [n.summary, n.raw_text, n.initiative?.name, n.initiative_id ? undefined : 'others']))
    : []
  const nothingFound = spaceHits.length + listHits.length + itemHits.length + searchResults.length === 0
  const updateStatus = useUpdateTaskStatus()
  const [openItemId, setOpenItemId] = useState<number | null>(null)
  const openItem = (taskData?.tasks ?? []).find((t) => t.id === openItemId) ?? null
  const goToSpace = (id: number | null | undefined) => {
    setFilter(id ? id : -1)
    setQuery('')
    document.getElementById('app-scroll')?.scrollTo({ top: 0 })
  }
  const heading = (text: string, n: number) => (
    <h3 className="mb-2 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint">
      {text}
      <span className="font-medium normal-case tracking-normal opacity-80"> · {n}</span>
    </h3>
  )
  const hitRow = (key: string, leading: React.ReactNode, title: string, sub: string, onClick: () => void) => (
    <button key={key} type="button" onClick={onClick} className="pressable flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="flex w-6 flex-shrink-0 items-center justify-center text-[1.125rem]">{leading}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem]">{title}</span>
        {sub && <span className="block truncate text-[0.8125rem] text-text-muted">{sub}</span>}
      </span>
      <ChevronRight size={16} strokeWidth={2} className="flex-shrink-0 text-text-faint" />
    </button>
  )

  // Initiatives with something in them, in the user's own order; Others last.
  // Labels (lists) by the space they were made for; one with no home yet sits under Others.
  const labelGroups = useMemo(() => {
    const map = new Map<number, ItemList[]>()
    for (const l of allLists ?? []) {
      const id = l.initiative_id ?? 0
      ;(map.get(id) ?? map.set(id, []).get(id)!).push(l)
    }
    return map
  }, [allLists])
  const has = (id: number) =>
    !!groups.get(id)?.notes.length || !!itemGroups.get(id)?.some((t) => t.status === 'open' || t.list_id) || !!labelGroups.get(id)?.length
  const blocks = [
    ...(initiatives ?? []).filter((i) => has(i.id)).map((i) => ({ id: i.id, initiative: i })),
    ...(has(0) ? [{ id: 0, initiative: null }] : []),
  ]

  const focusId = filter === null ? null : filter === -1 ? 0 : filter
  const focusInitiative = focusId ? initiatives?.find((i) => i.id === focusId) ?? null : null
  const empty = { notes: [] as Interaction[] }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Spaces" showProfile />

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
      {notes?.length === 0 && taskData && itemGroups.size === 0 && (
        <EmptyState
          title="No notes yet"
          body="Head to Home and jot something down — it's filed under its initiative, with any tasks ready to tick."
          to="/"
          cta="Log your first note"
        />
      )}

      {q ? (
        <div className="lg:max-w-3xl">
          {nothingFound && <p className="py-10 text-center text-[0.9375rem] text-text-muted">Nothing matches “{query}”.</p>}
          {spaceHits.length > 0 && (
            <section className="mb-5">
              {heading('Spaces', spaceHits.length)}
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
                {spaceHits.map((i) => {
                  const style = getInitiativeStyle(i)
                  const count = (groups.get(i.id)?.notes.length ?? 0) + (itemGroups.get(i.id)?.filter((t) => t.status === 'open').length ?? 0)
                  return hitRow(
                    `s${i.id}`,
                    style ? <style.Icon size={18} strokeWidth={2.2} style={{ color: style.color }} /> : null,
                    i.name,
                    count ? `${count} ${count === 1 ? 'thing' : 'things'}` : 'Empty',
                    () => goToSpace(i.id),
                  )
                })}
              </div>
            </section>
          )}
          {listHits.length > 0 && (
            <section className="mb-5">
              {heading('Lists', listHits.length)}
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
                {listHits.map((l) =>
                  hitRow(`l${l.id}`, l.emoji ?? '📋', l.name, `in ${spaceName(l.initiative_id)}`, () => goToSpace(l.initiative_id)),
                )}
              </div>
            </section>
          )}
          {itemHits.length > 0 && (
            <section className="mb-5">
              {heading('To-dos and list entries', itemHits.length)}
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
                {itemHits.slice(0, 30).map((t) => (
                  <ItemRow
                    key={t.id}
                    task={t}
                    compactDate
                    showList
                    onToggle={(x) => updateStatus.mutate({ taskId: x.id, status: x.status === 'done' ? 'open' : 'done', repeats: !!x.repeat })}
                    onOpen={(x) => setOpenItemId(x.id)}
                  />
                ))}
              </div>
            </section>
          )}
          {searchResults.length > 0 && (
            <section>
              {heading('Notes', searchResults.length)}
              <div className="flex flex-col gap-2.5">
                {searchResults.map((n) => (
                  <InteractionCard key={n.id} interaction={n} />
                ))}
              </div>
            </section>
          )}
          {openItem && <ItemSheet task={openItem} onClose={() => setOpenItemId(null)} />}
        </div>
      ) : focusId !== null ? (
        <InitiativeView
          key={focusId}
          onCollapse={() => setFilter(null)}
          id={focusId}
          initiative={focusInitiative}
          notes={(groups.get(focusId) ?? empty).notes}
          items={itemGroups.get(focusId) ?? []}
          labels={labelGroups.get(focusId) ?? []}
        />
      ) : (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-stretch xl:grid-cols-3">
          {blocks.map((b) => (
            <InitiativeBlock
              key={b.id}
              id={b.id}
              initiative={b.initiative}
              notes={groups.get(b.id)?.notes ?? []}
              items={itemGroups.get(b.id) ?? []}
              onOpen={() => {
                setFilter(b.id === 0 ? -1 : b.id)
                document.getElementById('app-scroll')?.scrollTo({ top: 0 })
              }}
            />
          ))}
        </div>
      )}

      <InitiativeBar
        counts={counts}
        hideChips={!!q}
        search={
          notes && (notes.length > 0 || (initiatives?.length ?? 0) > 0 || (taskData?.tasks.length ?? 0) > 0) ? (
          // The same field as the composer on Home and Today (height, outline, rounding, shadow), so every page's box at the
          // foot of the screen looks alike.
          <div className="flex min-h-11 items-center rounded-[1.4rem] border border-border-strong bg-bg-card shadow-card focus-within:border-accent">
            <Search size={18} strokeWidth={2} className="pointer-events-none ml-4 flex-shrink-0 text-text-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search spaces, lists, to-dos and notes"
              className="block min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base leading-6 text-text placeholder:text-text-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="pressable mr-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-text-faint"
              >
                <X size={16} strokeWidth={2} />
              </button>
            )}
          </div>
          ) : null
        }
      />
    </div>
  )
}
