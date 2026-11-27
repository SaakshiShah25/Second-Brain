import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, FileText, Search } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { useLists } from '../api/lists'
import { useNotes } from '../api/notes'
import { useTasks } from '../api/tasks'
import { getInitiativeStyle } from '../lib/initiativeStyle'
import { notePoints } from '../lib/initiativeFilter'
import { dueLabel } from '../lib/dates'
import { matchesAll, rank, tokens } from '../lib/search'
import { taskInitiativeId } from '../lib/taskOptions'
import { useOpenSpace } from '../lib/useOpenSpace'

interface Hit {
  key: string
  group: string
  icon: ReactNode
  title: string
  sub: string
  open: () => void
}

const PER_GROUP = 6

// Search from anywhere on a laptop (Ctrl/⌘ K, or the box in the sidebar): spaces, lists, to-dos and notes, driven by
// the keyboard - type, arrow down, Enter. With nothing typed it is a quick way to jump to a space.
export default function SearchPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const openSpace = useOpenSpace()
  const { data: initiatives = [] } = useInitiatives()
  const { data: lists = [] } = useLists()
  const { data: notes = [] } = useNotes()
  const { data: taskData } = useTasks('all')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(0)
  const list = useRef<HTMLDivElement>(null)

  const words = tokens(query)
  const spaceName = (id: number | null | undefined) => (id ? (initiatives.find((i) => i.id === id)?.name ?? 'Others') : 'Others')
  const go = (run: () => void) => () => {
    onClose()
    run()
  }

  const spaces: Hit[] = initiatives
    .filter((i) => !words.length || matchesAll(words, [i.name]))
    .sort((a, b) => (words.length ? rank(words, b.name) - rank(words, a.name) : 0))
    .slice(0, words.length ? PER_GROUP : 12)
    .map((i) => {
      const style = getInitiativeStyle(i)
      return {
        key: `s${i.id}`,
        group: words.length ? 'Spaces' : 'Jump to a space',
        icon: style ? <style.Icon size={17} strokeWidth={2.1} style={{ color: style.color }} /> : null,
        title: i.name,
        sub: '',
        open: go(() => openSpace(i.id)),
      }
    })
  const listHits: Hit[] = !words.length
    ? []
    : lists
        .filter((l) => matchesAll(words, [l.name, spaceName(l.initiative_id)]))
        .slice(0, PER_GROUP)
        .map((l) => ({
          key: `l${l.id}`,
          group: 'Lists',
          icon: l.emoji ?? '📋',
          title: l.name,
          sub: `in ${spaceName(l.initiative_id)}`,
          open: go(() => openSpace(l.initiative_id ?? null, 'lists')),
        }))
  const todos: Hit[] = !words.length
    ? []
    : (taskData?.tasks ?? [])
        .filter((t) => matchesAll(words, [t.description, t.detail, t.item_list?.name, spaceName(taskInitiativeId(t))]))
        .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || rank(words, b.description) - rank(words, a.description))
        .slice(0, PER_GROUP)
        .map((t) => ({
          key: `t${t.id}`,
          group: 'To-dos and list entries',
          icon: t.item_list?.emoji ?? <span className="h-4 w-4 rounded-full border-2 border-text-faint" />,
          title: t.description,
          sub: [spaceName(taskInitiativeId(t)), t.item_list?.name, t.due_date ? dueLabel(t.due_date, t.due_time) : '', t.status === 'done' ? 'Done' : ''].filter(Boolean).join(' · '),
          open: go(() => navigate(`/today?open=${t.id}`)),
        }))
  const noteHits: Hit[] = !words.length
    ? []
    : notes
        .filter((n) => matchesAll(words, [n.summary, n.raw_text, n.initiative?.name]))
        .slice(0, PER_GROUP)
        .map((n) => ({
          key: `n${n.id}`,
          group: 'Notes',
          icon: <FileText size={17} strokeWidth={2} className="text-text-muted" />,
          title: notePoints(n.summary)[0] ?? n.raw_text,
          sub: spaceName(n.initiative_id),
          open: go(() => navigate(`/notes?open=${n.id}`)),
        }))
  const hits = [...spaces, ...listHits, ...todos, ...noteHits]
  const current = Math.min(picked, Math.max(0, hits.length - 1))

  useEffect(() => {
    list.current?.querySelector('[data-picked="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [current, query])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (hits.length) setPicked((current + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      hits[current]?.open()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-[var(--sb-scrim)]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown} className="relative flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-strong bg-bg-card shadow-card">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search size={19} strokeWidth={2} className="flex-shrink-0 text-text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPicked(0)
            }}
            placeholder="Search spaces, lists, to-dos and notes"
            aria-label="Search"
            className="min-w-0 flex-1 bg-transparent py-4 text-base text-text placeholder:text-text-faint focus:outline-none"
          />
          <kbd className="rounded-md border border-border-strong px-1.5 py-0.5 text-[0.75rem] text-text-faint">Esc</kbd>
        </div>
        <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-2">
          {hits.length === 0 && <p className="px-3 py-8 text-center text-[0.9375rem] text-text-muted">{words.length ? `Nothing matches “${query}”.` : 'No spaces yet.'}</p>}
          {hits.map((h, i) => (
            <div key={h.key}>
              {h.group !== hits[i - 1]?.group && <p className="px-3 pt-2 pb-1 text-[0.75rem] font-semibold uppercase tracking-wide text-text-faint">{h.group}</p>}
              <button
                type="button"
                data-picked={i === current}
                onMouseMove={() => setPicked(i)}
                onClick={h.open}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === current ? 'bg-bg-hover' : ''}`}
              >
                <span className="flex w-6 flex-shrink-0 items-center justify-center">{h.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem]">{h.title}</span>
                  {h.sub && <span className="block truncate text-[0.8125rem] text-text-muted">{h.sub}</span>}
                </span>
                {i === current && <CornerDownLeft size={15} strokeWidth={2} className="flex-shrink-0 text-text-faint" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
