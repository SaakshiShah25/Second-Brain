import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ListFilter, Search, SlidersHorizontal } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { getInitiativeStyle } from '../lib/initiativeStyle'
import { fold } from '../lib/search'
import { spaceScores } from '../lib/frecency'
import { useNotes } from '../api/notes'
import { useTasks } from '../api/tasks'
import { useInitiativeFilter, type FilterScope } from '../lib/initiativeFilter'
import Chip, { ChipRow } from './Chip'
import InitiativesManager from './InitiativesManager'
import Sheet from './Sheet'

// The one initiative picker, pinned to the bottom of both Tasks and Notes - right under the thumb. The
// selection is shared (lib/initiativeFilter), so switching tabs keeps the
// focus. `counts` (keyed by initiative id, -1 for Others) adds a small
// number to each chip - e.g. open tasks on Today; chips with no count
// still show, so an initiative never disappears just because it's quiet.
export default function InitiativeBar({ counts, search, hideChips = false, scope = 'spaces' }: { counts?: Map<number, number>; search?: ReactNode; hideChips?: boolean; scope?: FilterScope }) {
  const { data: initiatives } = useInitiatives()
  const { data: notes } = useNotes()
  const { data: taskData } = useTasks('all')
  const [filter, setFilter] = useInitiativeFilter(scope)
  const [managing, setManaging] = useState(false)
  const [picking, setPicking] = useState(false)
  const [pickQuery, setPickQuery] = useState('')

  // A deleted initiative can't stay selected.
  useEffect(() => {
    if (typeof filter === 'number' && filter > 0 && initiatives && !initiatives.some((i) => i.id === filter)) setFilter(null)
  }, [initiatives, filter, setFilter])

  // Whichever space is chosen (from the list or a chip) is scrolled to the middle of the row, so it never hides off-screen.
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>(`[data-space="${filter ?? 'all'}"]`)
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [filter, initiatives])
  const choose = (value: number | null) => {
    setFilter(value)
    setPicking(false)
    setPickQuery('')
  }
  const scores = spaceScores(notes, taskData?.tasks)
  const rows = [
    { key: 'all', value: null as number | null, name: 'All spaces', style: null, count: undefined as number | undefined },
    // Most used first: how often and how recently notes and to-dos were added to each (lib/frecency.ts). Spaces with
    // the same score (all unused) keep the order you set.
    ...[...(initiatives ?? [])]
      .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
      .map((i) => ({ key: String(i.id), value: i.id as number | null, name: i.name, style: getInitiativeStyle(i), count: counts?.get(i.id) })),
    { key: 'others', value: -1 as number | null, name: 'Others', style: null, count: counts?.get(-1) },
  ]
  const shown = rows.filter((r) => !pickQuery.trim() || r.key === 'all' || fold(r.name).includes(fold(pickQuery.trim())))

  const count = (key: number) => {
    const n = counts?.get(key)
    return n ? <span className="text-[0.75rem] opacity-75">{n}</span> : null
  }

  return (
    <>
      {/* mt-auto pushes it to the foot of a short page; sticky keeps it on screen while a long page scrolls. */}
      <div ref={bar} className="sticky bottom-0 z-10 -mx-4 -mb-6 mt-auto border-t border-border bg-bg/95 pt-2.5 pb-2.5 backdrop-blur-xl">
      {/* On a laptop the box and chips stay one readable, centred width under the wider page. */}
      <div className="w-full">
      {search && <div className={`px-4 ${hideChips ? '' : 'mb-2.5'}`}>{search}</div>}
      {!hideChips && (
      <div className="flex items-center gap-2 px-4">
        {/* Select stays put while the chips scroll: every space in one vertical list, most used first. */}
        <Chip onClick={() => setPicking(true)} aria-label="Choose a space from a list" className="!min-w-0 !px-3">
          <ListFilter size={15} strokeWidth={2} className="flex-shrink-0" />
          Select
        </Chip>
        <div className="min-w-0 flex-1">
      <ChipRow className="!mx-0 !px-0">
        <Chip data-space="all" active={filter === null} onClick={() => setFilter(null)}>
          All
        </Chip>
        {initiatives?.map((i) => {
          const style = getInitiativeStyle(i)
          return (
            <Chip key={i.id} data-space={i.id} active={filter === i.id} color={style?.color} onClick={() => setFilter(i.id)}>
              {style && <style.Icon size={14} strokeWidth={2} />}
              {i.name}
              {count(i.id)}
            </Chip>
          )
        })}
        <Chip data-space="-1" active={filter === -1} onClick={() => setFilter(-1)}>
          Others
          {count(-1)}
        </Chip>
        <Chip onClick={() => setManaging(true)} aria-label="Manage initiatives" className="!min-w-0 !px-3">
          <SlidersHorizontal size={15} strokeWidth={2} />
        </Chip>
      </ChipRow>
        </div>
      </div>
      )}
      </div>
      </div>

      {picking && (
        <Sheet
          onClose={() => {
            setPicking(false)
            setPickQuery('')
          }}
          title="Choose a space"
          tall
        >
          <p className="-mt-1 mb-3 text-[0.8125rem] text-text-faint">Most used first - by how often and how recently you add to each.</p>
          {rows.length > 7 && (
            <div className="mb-3 flex min-h-11 items-center rounded-2xl border border-border-strong bg-bg-card focus-within:border-accent">
              <Search size={17} strokeWidth={2} className="ml-3.5 flex-shrink-0 text-text-faint" />
              <input
                // Not on a phone: the keyboard would cover the very list the person came to look at.
                autoFocus={window.matchMedia('(min-width: 1024px)').matches}
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
                placeholder="Find a space"
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-text placeholder:text-text-faint focus:outline-none"
              />
            </div>
          )}
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
            {shown.map((r) => {
              const selected = filter === r.value
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => choose(r.value)}
                  aria-pressed={selected}
                  className={`pressable flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left ${selected ? 'bg-accent-soft' : ''}`}
                >
                  <span className="flex w-5 flex-shrink-0 items-center justify-center">
                    {r.style ? <r.style.Icon size={17} strokeWidth={2.1} style={{ color: r.style.color }} /> : null}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-[0.9375rem] ${selected ? 'font-semibold' : ''}`}>{r.name}</span>
                  {r.count ? <span className="flex-shrink-0 text-[0.8125rem] text-text-muted">{r.count}</span> : null}
                  {selected && <Check size={17} strokeWidth={2.4} className="flex-shrink-0 text-accent" />}
                </button>
              )
            })}
            {shown.length === 0 && <p className="px-4 py-6 text-center text-[0.9375rem] text-text-muted">No space matches “{pickQuery}”.</p>}
          </div>
        </Sheet>
      )}

      {managing && (
        <Sheet onClose={() => setManaging(false)} title="Initiatives" tall>
          <InitiativesManager />
        </Sheet>
      )}
    </>
  )
}
