import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronDown, ChevronRight, NotebookText } from 'lucide-react'
import { useTasks, useUpdateTaskStatus } from '../api/tasks'
import type { Initiative, Task } from '../api/types'
import Button from '../components/Button'
import InitiativeBar from '../components/InitiativeBar'
import ItemRow from '../components/ItemRow'
import ItemSheet from '../components/ItemSheet'
import PageHeader from '../components/PageHeader'
import QuickAdd from '../components/QuickAdd'
import { useInitiatives } from '../api/initiatives'
import { useNotes } from '../api/notes'
import { useConnection } from '../lib/connection'
import { groupByInitiative } from '../lib/groupByInitiative'
import { matchesInitiative, useInitiativeFilter } from '../lib/initiativeFilter'
import { getInitiativeStyle } from '../lib/initiativeStyle'
import { byDue, itemInitiativeId } from '../lib/items'
import { useOpenItem } from '../lib/useOpenItem'

type OwnerFilter = 'all' | 'me' | 'them'

const PILL_OPTIONS: { value: OwnerFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'me', label: 'I owe' },
  { value: 'them', label: 'Others owe' },
]

// One small control for whose follow-ups to show.
function OwnerPills({ value, onChange }: { value: OwnerFilter; onChange: (v: OwnerFilter) => void }) {
  return (
    <div role="tablist" aria-label="Whose tasks" className="flex rounded-full bg-bg-elevated p-0.5">
      {PILL_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-full px-3 text-[0.8125rem] font-medium ${
            o.value === value ? 'bg-accent-soft text-accent ring-1 ring-accent/40' : 'text-text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// An initiative's heading (icon + name in its colour, with a count), then its tasks.
function TaskSection({
  title,
  initiative,
  tasks,
  ...rowProps
}: {
  title: string
  initiative: Initiative | null
  tasks: Task[]
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
}) {
  const style = getInitiativeStyle(initiative)
  return (
    <section className="mb-5" aria-label={title}>
      <h3
        className="mb-2 flex items-center gap-1.5 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint"
        style={style ? { color: style.color } : undefined}
      >
        {style && <style.Icon size={14} strokeWidth={2.2} />}
        {title}
        <span className="font-medium normal-case tracking-normal opacity-80">· {tasks.length}</span>
      </h3>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
        {tasks.map((t) => (
          <ItemRow key={t.id} task={t} {...rowProps} />
        ))}
      </div>
    </section>
  )
}

// The main Tasks list: every to-do that isn't in a named list, grouped under its initiative.
export default function TasksPage() {
  const [showCompleted, setShowCompleted] = useState(false)
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all')
  const { data, error, refetch, isFetching } = useTasks('all')
  const connection = useConnection()
  const offline = connection.offline || connection.unreachable
  const allTasks = useMemo(() => (data?.tasks ?? []).filter((t) => !t.list_id), [data])
  const sheet = useOpenItem(allTasks)

  // Tasks are shown under their initiative, never sorted by when they are due.
  const [initiativeFilter] = useInitiativeFilter()
  const { data: initiatives } = useInitiatives()
  const { data: notes } = useNotes()
  const inFocus = allTasks.filter((t) => matchesInitiative(initiativeFilter, itemInitiativeId(t)))
  const shown = inFocus.filter((t) => ownerFilter === 'all' || t.owner === ownerFilter)
  // Open tasks per initiative, for the chip counts.
  const openCounts = useMemo(() => {
    const map = new Map<number, number>()
    for (const t of allTasks) {
      if (t.status !== 'open') continue
      const key = itemInitiativeId(t) ?? -1
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [allTasks])
  const focusName =
    initiativeFilter === null ? null : initiativeFilter === -1 ? 'Others' : initiatives?.find((i) => i.id === initiativeFilter)?.name
  const focusNotes = (notes ?? []).filter((n) => matchesInitiative(initiativeFilter, n.initiative_id)).length
  const open = shown.filter((t) => t.status === 'open')
  const groups = groupByInitiative(open.slice().sort(byDue), initiatives ?? [], itemInitiativeId)
  const doneTasks = shown.filter((t) => t.status === 'done').sort((a, b) => (b.due_date ?? '').localeCompare(a.due_date ?? ''))
  const updateStatus = useUpdateTaskStatus()

  return (
    <div>
      <PageHeader title="☑️ Tasks" backTo="/lists" backLabel="Lists" />

      <QuickAdd listId={null} placeholder="Add a task" />

      <InitiativeBar counts={openCounts} className="mb-4" />

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[0.9375rem] text-text-muted">{!data ? '' : open.length === 0 ? 'Nothing open' : `${open.length} open`}</p>
        <OwnerPills value={ownerFilter} onChange={setOwnerFilter} />
      </div>

          {/* Only say "All clear" once the tasks have actually arrived - not while loading or offline. */}
          {!data && (
            <div className="py-8 text-center">
              {error ? (
                <>
                  <p className="mb-3 text-[0.9375rem] text-text-muted">
                    {offline ? "You're offline, so your tasks can't load right now." : "Couldn't load your tasks."}
                  </p>
                  <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
                    {isFetching ? 'Trying…' : 'Try again'}
                  </Button>
                </>
              ) : (
                <p className="text-[0.9375rem] text-text-muted">
                  {offline ? "You're offline. Your tasks will appear when you're back online." : 'Loading…'}
                </p>
              )}
            </div>
          )}
          {data && open.length === 0 && (
            <div className="mb-6 rounded-2xl border border-dashed border-border-strong py-8 text-center">
              <CheckCircle2 size={28} strokeWidth={1.6} className="mx-auto mb-2 text-success" />
              <p className="text-[0.9375rem] text-text-muted">
                {focusName ? `Nothing open in ${focusName}.` : 'All clear. Nothing waiting on anyone.'}
              </p>
            </div>
          )}

          {(() => {
            const rowProps = {
              onToggle: (t: Task) =>
                updateStatus.mutate({ taskId: t.id, status: t.status === 'done' ? 'open' : 'done', repeats: !!t.repeat }),
              onOpen: sheet.open,
            }
            return (
              <>
                {groups.map((g) => (
                  <TaskSection key={g.key} title={g.name} initiative={g.initiative} tasks={g.items} {...rowProps} />
                ))}
                {doneTasks.length > 0 && (
                  <section className="mb-5" aria-label="Completed">
                    <button
                      type="button"
                      onClick={() => setShowCompleted((v) => !v)}
                      aria-expanded={showCompleted}
                      className="pressable mb-2 flex items-center gap-1.5 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint"
                    >
                      Completed
                      <span className="font-medium normal-case tracking-normal opacity-80">· {doneTasks.length}</span>
                      <ChevronDown size={15} strokeWidth={2.2} className={showCompleted ? 'rotate-180' : ''} />
                    </button>
                    {showCompleted && (
                      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
                        {doneTasks.slice(0, 30).map((t) => (
                          <ItemRow key={t.id} task={t} {...rowProps} />
                        ))}
                      </div>
                    )}
                  </section>
                )}
                {focusName && focusNotes > 0 && (
                  <Link
                    to="/notes"
                    className="pressable mb-5 flex items-center gap-2.5 rounded-xl bg-bg-elevated px-3.5 py-2.5 text-[0.9375rem]"
                  >
                    <NotebookText size={17} strokeWidth={2} className="flex-shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate">
                      {focusNotes} {focusNotes === 1 ? 'note' : 'notes'} in {focusName}
                    </span>
                    <ChevronRight size={17} strokeWidth={2} className="flex-shrink-0 text-text-faint" />
                  </Link>
                )}
              </>
            )
          })()}

      {sheet.active && <ItemSheet task={sheet.active} onClose={sheet.close} />}
    </div>
  )
}
