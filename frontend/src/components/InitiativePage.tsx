import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, ListChecks } from 'lucide-react'
import { useInitiativeDigest } from '../api/initiatives'
import type { Interaction, Task } from '../api/types'
import { getInitiativeStyle, initiativeBadgeStyle } from '../lib/initiativeStyle'
import InteractionCard, { Points, TaskLine } from './InteractionCard'

type Ini = { id: number; name: string; color: string | null } | null

interface Props {
  // 0 = Others (notes with no initiative)
  id: number
  initiative: Ini
  notes: Interaction[]
  tasks: Task[]
}

const openFirst = (a: Task, b: Task) =>
  Number(a.status === 'done') - Number(b.status === 'done') || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')

function Heading({ initiative, size = 'md' }: { initiative: Ini; size?: 'md' | 'lg' }) {
  const style = getInitiativeStyle(initiative)
  const box = size === 'lg' ? 'h-10 w-10 rounded-xl' : 'h-8 w-8 rounded-lg'
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        className={`flex flex-shrink-0 items-center justify-center ${box} ${style ? '' : 'bg-bg-elevated text-text-muted'}`}
        style={style ? initiativeBadgeStyle(style.color) : undefined}
      >
        {style ? <style.Icon size={size === 'lg' ? 20 : 16} strokeWidth={2} /> : <FileText size={16} strokeWidth={2} />}
      </span>
      <span className={`truncate font-semibold tracking-tight ${size === 'lg' ? 'text-xl' : 'text-[1.0625rem]'}`}>
        {initiative?.name ?? 'Others'}
      </span>
    </span>
  )
}

const PREVIEW_TASKS = 3

// One initiative on the Notes overview: its counts and what's still open. Tapping the header opens the full page.
export function InitiativeBlock({ initiative, notes, tasks, onOpen }: Props & { onOpen: () => void }) {
  const open = tasks.filter((t) => t.status === 'open').sort(openFirst)

  return (
    <section className="rounded-2xl border border-border bg-bg-card">
      <button type="button" onClick={onOpen} className="pressable block w-full px-4 pt-3.5 pb-3 text-left">
        <span className="flex items-center gap-2">
          <Heading initiative={initiative} />
          <ChevronRight size={18} strokeWidth={2} className="ml-auto flex-shrink-0 text-text-faint" />
        </span>
        <span className="mt-1.5 block pl-[2.625rem] text-[0.8125rem] text-text-faint">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          {open.length > 0 && ` · ${open.length} open ${open.length === 1 ? 'task' : 'tasks'}`}
        </span>
      </button>
      {open.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-border px-4 py-3">
          {open.slice(0, PREVIEW_TASKS).map((t) => (
            <TaskLine key={t.id} task={t} onOpen={onOpen} />
          ))}
          {open.length > PREVIEW_TASKS && (
            <li>
              <button type="button" onClick={onOpen} className="pressable pl-7 text-[0.8125rem] font-medium text-link">
                +{open.length - PREVIEW_TASKS} more
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

// The whole initiative as one page: its notes' points in the sections that fit the subject, then every task - open and done.
export function InitiativeView({ id, initiative, notes, tasks }: Props) {
  const digest = useInitiativeDigest(id)
  const [showNotes, setShowNotes] = useState(false)
  const sorted = [...tasks].sort(openFirst)
  const openCount = tasks.filter((t) => t.status === 'open').length
  const style = getInitiativeStyle(initiative)
  const d = digest.data

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-border bg-bg-card p-4">
        <Heading initiative={initiative} size="lg" />

        {digest.isLoading && !d ? (
          <div className="mt-4 flex flex-col gap-2">
            <span className="h-3 w-1/3 animate-pulse rounded-full bg-bg-elevated" />
            <span className="h-3 w-11/12 animate-pulse rounded-full bg-bg-elevated" />
            <span className="h-3 w-4/5 animate-pulse rounded-full bg-bg-elevated" />
          </div>
        ) : (
          d?.sections.map((s) => (
            <div key={s.title} className="mt-4">
              <h3
                className="mb-1.5 text-[0.8125rem] font-semibold uppercase tracking-wide"
                style={{ color: style?.color }}
              >
                {s.title}
              </h3>
              <Points points={s.points} />
            </div>
          ))
        )}
        {!digest.isLoading && d && d.sections.length === 0 && (
          <p className="mt-3 text-[0.9375rem] text-text-muted">No notes here yet.</p>
        )}
      </div>

      {sorted.length > 0 && (
        <section className="mb-4 rounded-2xl border border-border bg-bg-card p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint">
            <ListChecks size={15} strokeWidth={2} /> Tasks
            <span className="font-medium normal-case tracking-normal">
              · {openCount} open{tasks.length > openCount ? `, ${tasks.length - openCount} done` : ''}
            </span>
          </h3>
          <ul className="flex flex-col gap-2.5">
            {sorted.map((t) => (
              <TaskLine key={t.id} task={t} />
            ))}
          </ul>
        </section>
      )}

      {notes.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            aria-expanded={showNotes}
            className="pressable mb-2 flex items-center gap-1.5 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint"
          >
            Individual notes
            <span className="font-medium normal-case tracking-normal">· {notes.length}</span>
            <ChevronDown size={15} strokeWidth={2.2} className={showNotes ? 'rotate-180' : ''} />
          </button>
          {showNotes && (
            <div className="flex flex-col gap-2.5">
              {notes.map((n) => (
                <InteractionCard key={n.id} interaction={n} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
