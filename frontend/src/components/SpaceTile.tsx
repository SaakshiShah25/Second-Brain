import { FileText, NotebookText } from 'lucide-react'
import type { Interaction, Task } from '../api/types'
import { getInitiativeStyle, initiativeBadgeStyle } from '../lib/initiativeStyle'
import { isOverdue, todayIso } from '../lib/items'
import { tint } from '../lib/taskOptions'

type Ini = { id: number; name: string; color: string | null } | null

/** What a space's tile says about its to-dos (list entries are things to collect, not to-dos, so they're left out). */
export function spaceStats(items: Task[], now: Date = new Date()) {
  const today = todayIso()
  const open = items.filter((t) => t.status === 'open' && !t.list_id)
  return {
    pending: open.length,
    overdue: open.filter((t) => isOverdue(t, now)).length,
    dueToday: open.filter((t) => t.due_date === today && !isOverdue(t, now)).length,
    urgent: open.filter((t) => t.priority === 'high').length,
  }
}

/** One space as a square tile: its name, and at a glance how many to-dos are pending, overdue, due today or urgent. */
export default function SpaceTile({ initiative, notes, items, onOpen }: { initiative: Ini; notes: Interaction[]; items: Task[]; onOpen: () => void }) {
  const style = getInitiativeStyle(initiative)
  const name = initiative?.name ?? 'Others'
  const s = spaceStats(items)
  const flags = [
    s.overdue > 0 && { label: 'Overdue', n: s.overdue, color: 'var(--sb-prio-high)' },
    s.urgent > 0 && { label: 'Urgent', n: s.urgent, color: 'var(--sb-prio-normal)' },
    s.dueToday > 0 && { label: 'Due today', n: s.dueToday, color: style?.color ?? 'var(--sb-accent)' },
  ].filter(Boolean) as { label: string; n: number; color: string }[]

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${name}: ${s.pending} pending, ${s.overdue} overdue, ${s.urgent} urgent, ${s.dueToday} due today`}
      className="pressable relative flex h-full min-h-[10.5rem] w-full flex-col overflow-hidden rounded-3xl border border-border bg-bg-card p-3.5 text-left shadow-card"
      style={style ? { backgroundImage: `linear-gradient(160deg, ${tint(style.color, 14)}, transparent 62%)` } : undefined}
    >
      <span
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${style ? '' : 'bg-bg-elevated text-text-muted'}`}
        style={style ? initiativeBadgeStyle(style.color) : undefined}
      >
        {style ? <style.Icon size={18} strokeWidth={2.1} /> : <FileText size={18} strokeWidth={2.1} />}
      </span>
      <span className="mt-2.5 line-clamp-2 text-[1.0625rem] font-semibold leading-tight tracking-tight">{name}</span>

      <span className="mt-auto flex flex-col gap-1.5 pt-3">
        {flags.slice(0, 2).map((f) => (
          <span
            key={f.label}
            className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[0.75rem] font-semibold"
            style={{ background: tint(f.color, 16), color: f.color }}
          >
            {f.n} {f.label.toLowerCase()}
          </span>
        ))}
        <span className="flex items-end justify-between gap-2">
          <span className="leading-none">
            <span className="text-[1.75rem] font-bold tracking-tight">{s.pending}</span>
            <span className="ml-1 text-[0.8125rem] text-text-muted">pending</span>
          </span>
          {notes.length > 0 && (
            <span className="flex items-center gap-1 pb-0.5 text-[0.75rem] text-text-faint">
              <NotebookText size={13} strokeWidth={2} />
              {notes.length}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
