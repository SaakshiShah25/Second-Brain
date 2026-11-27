import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, CalendarDays, CheckCircle2, ChevronDown, FileText, ListFilter, SlidersHorizontal, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { useNotes } from '../api/notes'
import type { Task } from '../api/types'
import { getInitiativeStyle } from '../lib/initiativeStyle'
import { notePoints, useInitiativeFilter } from '../lib/initiativeFilter'
import { openCountsByInitiative } from '../lib/items'
import { taskInitiativeId } from '../lib/taskOptions'
import InitiativesManager from './InitiativesManager'
import Sheet from './Sheet'

// The parts of Today that only a laptop or desktop has: a slim line of figures across the top, a menu that narrows the page to one
// space, and a column beside the to-dos with what was added most recently.

export interface Stat {
  key: string
  label: string
  value: number
  Icon: LucideIcon
  color: string
  onClick: () => void
}

export const STAT_ICONS = { overdue: TriangleAlert, today: CalendarClock, week: CalendarDays, done: CheckCircle2 }

// One slim line, so that what to do next - not the figures - is the first thing on the page.
export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="mb-5 grid grid-cols-4 divide-x divide-border overflow-hidden rounded-xl border border-border bg-bg-card">
      {stats.map((s) => (
        <button key={s.key} type="button" onClick={s.onClick} className="pressable flex min-w-0 items-center justify-center gap-2 px-3 py-2 text-left hover:bg-bg-hover">
          <s.Icon size={15} strokeWidth={2.2} style={{ color: s.color }} className="flex-shrink-0" />
          <span className="text-[1.0625rem] font-bold tabular-nums" style={s.value && s.key === 'overdue' ? { color: s.color } : undefined}>
            {s.value}
          </span>
          <span className="truncate text-[0.8125rem] text-text-muted">{s.label}</span>
        </button>
      ))}
    </div>
  )
}

function ago(iso: string, now = Date.now()): string {
  const then = new Date(iso)
  const minutes = Math.max(0, Math.floor((now - then.getTime()) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} hr ago`
  if (minutes < 48 * 60) return 'Yesterday'
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const RECENT = 12

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-bg-card p-2" aria-label={title}>
      <div className="flex h-8 items-center justify-between px-2">
        <h2 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

// "Show: All spaces" beside Sort: narrows Today to one space. A menu, not a second list of spaces - the sidebar already
// has one (which opens a space); this only filters the page you are on.
export function SpaceFilter({ tasks }: { tasks: Task[] }) {
  const { data: initiatives = [] } = useInitiatives()
  const [filter, setFilter] = useInitiativeFilter('today')
  const [open, setOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const counts = openCountsByInitiative(tasks)
  const spaces = [
    { value: null as number | null, name: 'All spaces', style: null, count: [...counts.values()].reduce((a, b) => a + b, 0) },
    ...initiatives.map((i) => ({ value: i.id as number | null, name: i.name, style: getInitiativeStyle(i), count: counts.get(i.id) ?? 0 })),
    { value: -1 as number | null, name: 'Others', style: null, count: counts.get(-1) ?? 0 },
  ]
  const current = spaces.find((s) => s.value === filter) ?? spaces[0]

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  // A deleted space can't stay selected.
  useEffect(() => {
    if (typeof filter === 'number' && filter > 0 && initiatives.length && !initiatives.some((i) => i.id === filter)) setFilter(null)
  }, [initiatives, filter, setFilter])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`pressable flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium ${
          filter === null ? 'border-border-strong text-text-muted' : 'border-accent/40 bg-accent-soft text-text'
        }`}
      >
        {current.style ? <current.style.Icon size={14} strokeWidth={2.2} style={{ color: current.style.color }} /> : <ListFilter size={14} strokeWidth={2.2} />}
        <span className="text-text-faint">Show:</span> {current.name}
        <ChevronDown size={14} strokeWidth={2.2} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1.5 w-64 rounded-xl border border-border-strong bg-bg-card p-1.5 shadow-card">
          <div role="listbox" aria-label="Show to-dos from" className="max-h-[min(18rem,40vh)] overflow-y-auto">
            {spaces.map((s) => (
              <button
                key={s.value ?? 'all'}
                type="button"
                role="option"
                aria-selected={current.value === s.value}
                onClick={() => {
                  setFilter(s.value)
                  setOpen(false)
                }}
                className={`pressable flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[0.875rem] ${current.value === s.value ? 'bg-accent-soft font-semibold' : 'hover:bg-bg-hover'}`}
              >
                <span className="flex w-4 flex-shrink-0 items-center justify-center">
                  {s.style && <s.style.Icon size={15} strokeWidth={2.1} style={{ color: s.style.color }} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {s.count > 0 && <span className="text-[0.8125rem] text-text-faint">{s.count}</span>}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setManaging(true)
            }}
            className="pressable mt-1 flex h-9 w-full items-center gap-2.5 rounded-lg border-t border-border px-2 text-left text-[0.875rem] text-text-muted hover:bg-bg-hover"
          >
            <SlidersHorizontal size={14} strokeWidth={2.1} className="w-4 flex-shrink-0" />
            Manage spaces
          </button>
        </div>
      )}
      {managing && (
        <Sheet onClose={() => setManaging(false)} title="Initiatives" tall>
          <InitiativesManager />
        </Sheet>
      )}
    </div>
  )
}

export function TodaySide({ tasks, onOpenTask }: { tasks: Task[]; onOpenTask: (t: Task) => void }) {
  const navigate = useNavigate()
  const { data: initiatives = [] } = useInitiatives()
  const { data: notes = [] } = useNotes()
  const spaceName = (id: number | null | undefined) => (id ? (initiatives.find((i) => i.id === id)?.name ?? 'Others') : 'Others')
  // What came in lately, notes and items together - however it was added.
  const recent = [
    ...tasks.map((t) => ({
      key: `t${t.id}`,
      at: t.created_at,
      title: t.description,
      where: spaceName(taskInitiativeId(t)),
      icon: t.item_list?.emoji ?? <span className="h-3.5 w-3.5 rounded-full border-2 border-text-faint" />,
      open: () => onOpenTask(t),
    })),
    ...notes.map((n) => ({
      key: `n${n.id}`,
      at: n.created_at,
      title: notePoints(n.summary)[0] ?? n.raw_text,
      where: spaceName(n.initiative_id),
      icon: <FileText size={15} strokeWidth={2} className="text-text-muted" />,
      open: () => navigate(`/notes?open=${n.id}`),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, RECENT)

  return (
    <div>
      <Panel title="Recently added">
        {recent.length === 0 && <p className="px-2 py-3 text-[0.875rem] text-text-muted">What you add shows up here.</p>}
        {recent.map((r) => (
          <button key={r.key} type="button" onClick={r.open} className="pressable flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-bg-hover">
            <span className="mt-0.5 flex w-4 flex-shrink-0 items-center justify-center text-[0.875rem]">{r.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[0.875rem] leading-snug">{r.title}</span>
              <span className="block truncate text-[0.75rem] text-text-faint">
                {r.where} · {ago(r.at)}
              </span>
            </span>
          </button>
        ))}
      </Panel>
    </div>
  )
}
