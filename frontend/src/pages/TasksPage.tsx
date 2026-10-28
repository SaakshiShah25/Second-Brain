import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Check, CheckCircle2, ChevronDown, ChevronRight, NotebookText, TriangleAlert } from 'lucide-react'
import { useEditTask, useTasks, useUpdateTaskOwner, useUpdateTaskStatus } from '../api/tasks'
import type { Initiative, Task } from '../api/types'
import Button from '../components/Button'
import { Input, Label } from '../components/fields'
import InitiativeBar from '../components/InitiativeBar'
import PageHeader from '../components/PageHeader'
import Sheet from '../components/Sheet'
import { useInitiatives } from '../api/initiatives'
import { useNotes } from '../api/notes'
import { useConnection } from '../lib/connection'
import { dueLabel, fullDate, isoLocal } from '../lib/dates'
import { groupByInitiative } from '../lib/groupByInitiative'
import { matchesInitiative, notePoints, useInitiativeFilter } from '../lib/initiativeFilter'
import { getInitiativeStyle } from '../lib/initiativeStyle'

function isOverdue(task: Task): boolean {
  return task.status === 'open' && !!task.due_date && task.due_date < isoLocal(new Date())
}

// The initiative a task belongs to (the one its note was filed under).
function taskInitiativeId(task: Task): number | null {
  return task.interaction?.initiative?.id ?? null
}

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

function TaskRow({
  task,
  onToggle,
  onOpen,
  toggling,
}: {
  task: Task
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  toggling: boolean
}) {
  const overdue = isOverdue(task)
  const done = task.status === 'done'
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {/* Things-style round checkbox, with a generous invisible hit area around the visible 22px circle. */}
      <button
        type="button"
        onClick={() => onToggle(task)}
        disabled={toggling}
        aria-label={done ? 'Reopen' : 'Mark done'}
        className="-m-2 flex-shrink-0 p-2 disabled:cursor-not-allowed"
      >
        <span
          className={`flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full border-2 transition-colors ${
            done ? 'border-success bg-success text-white' : task.owner === 'them' ? 'border-them-task' : 'border-text-faint'
          }`}
        >
          {done && <Check size={13} strokeWidth={3} />}
        </span>
      </button>
      <button type="button" onClick={() => onOpen(task)} className="pressable min-w-0 flex-1 text-left">
        <span className={`line-clamp-2 text-[0.9375rem] leading-snug ${done ? 'text-text-faint line-through' : ''}`}>
          {task.description}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-text-muted">
          {task.owner === 'them' && <span className="flex-shrink-0 text-them-task">Waiting</span>}
          {task.due_date && (
            <>
              {task.owner === 'them' && <span className="text-text-faint">·</span>}
              <span className={`flex flex-shrink-0 items-center gap-1 whitespace-nowrap ${overdue ? 'font-medium text-danger' : ''}`}>
                {overdue && <TriangleAlert size={12} strokeWidth={2.2} />}
                {dueLabel(task.due_date, task.due_time)}
              </span>
            </>
          )}
        </span>
      </button>
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
  toggling: boolean
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
          <TaskRow key={t.id} task={t} {...rowProps} />
        ))}
      </div>
    </section>
  )
}

export default function TasksPage() {
  const navigate = useNavigate()
  const [showCompleted, setShowCompleted] = useState(false)
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all')
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [editDesc, setEditDesc] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const { data, error, refetch, isFetching } = useTasks('all')
  const connection = useConnection()
  const offline = connection.offline || connection.unreachable
  const allTasks = data?.tasks ?? []
  const activeTask = allTasks.find((t) => t.id === activeTaskId) ?? null

  // Tasks are shown under their initiative, never sorted by when they are due.
  const [initiativeFilter] = useInitiativeFilter()
  const { data: initiatives } = useInitiatives()
  const { data: notes } = useNotes()
  const inFocus = allTasks.filter((t) => matchesInitiative(initiativeFilter, t.interaction?.initiative?.id ?? null))
  const shown = inFocus.filter((t) => ownerFilter === 'all' || t.owner === ownerFilter)
  // Open tasks per initiative, for the chip counts.
  const openCounts = useMemo(() => {
    const map = new Map<number, number>()
    for (const t of allTasks) {
      if (t.status !== 'open') continue
      const key = t.interaction?.initiative?.id ?? -1
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [allTasks])
  const focusName =
    initiativeFilter === null ? null : initiativeFilter === -1 ? 'Others' : initiatives?.find((i) => i.id === initiativeFilter)?.name
  const focusNotes = (notes ?? []).filter((n) => matchesInitiative(initiativeFilter, n.initiative_id)).length
  const open = shown.filter((t) => t.status === 'open')
  const byDue = (a: Task, b: Task) =>
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.due_time ?? '99').localeCompare(b.due_time ?? '99')
  const groups = groupByInitiative(open.slice().sort(byDue), initiatives ?? [], taskInitiativeId)
  const doneTasks = shown.filter((t) => t.status === 'done').sort((a, b) => (b.due_date ?? '').localeCompare(a.due_date ?? ''))
  const editTask = useEditTask()
  const updateStatus = useUpdateTaskStatus()
  const updateOwner = useUpdateTaskOwner()

  function openTask(task: Task) {
    setActiveTaskId(task.id)
    setEditing(false)
  }

  function startEditing(task: Task) {
    setEditDesc(task.description)
    setEditDate(task.due_date ?? '')
    setEditTime((task.due_time ?? '').slice(0, 5))
    setEditing(true)
  }

  return (
    <div>
      <PageHeader title="Tasks" showProfile />

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
              onToggle: (t: Task) => updateStatus.mutate({ taskId: t.id, status: t.status === 'done' ? 'open' : 'done' }),
              onOpen: openTask,
              toggling: updateStatus.isPending,
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
                          <TaskRow key={t.id} task={t} {...rowProps} />
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

      {activeTask && (
        <Sheet onClose={() => setActiveTaskId(null)}>
          <p className="mb-1 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint">Task</p>
          <p className="mb-1 text-lg leading-snug font-semibold">{activeTask.description}</p>
          <p className="mb-5 text-[0.9375rem] text-text-muted">
            {activeTask.interaction?.initiative?.name ?? 'Others'}
            {activeTask.due_date &&
              ` · ${isOverdue(activeTask) ? 'overdue, was due' : 'due'} ${dueLabel(activeTask.due_date, activeTask.due_time)}`}
          </p>

          {/* Where this task came from - tap to read (and edit) that note. */}
          {activeTask.interaction && (
            <button
              type="button"
              onClick={() => navigate(`/notes?open=${activeTask.interaction!.id}`)}
              className="pressable mb-4 flex w-full items-start gap-3 rounded-2xl border border-border bg-bg-elevated p-3.5 text-left"
            >
              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-bg-card text-text-muted">
                <NotebookText size={17} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.75rem] font-medium uppercase tracking-wide text-text-faint">
                  From a note · {fullDate(activeTask.interaction.date)}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[0.9375rem] leading-snug text-text">
                  {notePoints(activeTask.interaction.summary).join(' · ') || 'View the note'}
                </span>
                <span className="mt-1 block text-[0.8125rem] font-medium text-link">View the note</span>
              </span>
            </button>
          )}

          {editing ? (
            <div className="mb-4 rounded-2xl bg-bg-elevated p-3.5">
              <Label>What needs doing</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <Label>Due date</Label>
                  <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                </div>
                <div>
                  <Label>Time (optional)</Label>
                  <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} disabled={!editDate} />
                </div>
              </div>
              {editTask.isError && (
                <p className="mt-2 text-[0.8125rem] text-danger">
                  {editTask.error instanceof Error ? editTask.error.message : "Couldn't save that - please try again."}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button className="flex-1" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  disabled={editTask.isPending || !editDesc.trim()}
                  onClick={() =>
                    editTask.mutate(
                      {
                        taskId: activeTask.id,
                        description: editDesc.trim(),
                        due_date: editDate || null,
                        due_time: editDate && editTime ? editTime : null,
                      },
                      { onSuccess: () => setEditing(false) },
                    )
                  }
                >
                  {editTask.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => startEditing(activeTask)} className="pressable mb-4 text-[0.9375rem] font-medium text-link">
              Edit wording or deadline
            </button>
          )}

          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size="lg"
              block
              disabled={updateStatus.isPending}
              onClick={() =>
                updateStatus.mutate(
                  { taskId: activeTask.id, status: activeTask.status === 'open' ? 'done' : 'open' },
                  { onSuccess: () => setActiveTaskId(null) },
                )
              }
            >
              <Check size={18} strokeWidth={2.4} />
              {activeTask.status === 'open' ? 'Mark done' : 'Reopen'}
            </Button>
            <Button
              size="lg"
              block
              disabled={updateOwner.isPending}
              onClick={() =>
                updateOwner.mutate({ taskId: activeTask.id, owner: activeTask.owner === 'them' ? 'me' : 'them' })
              }
            >
              <ArrowLeftRight size={17} strokeWidth={2} />
              {activeTask.owner === 'them' ? 'Actually, I owe this' : 'Actually, someone else owes this'}
            </Button>

          </div>
        </Sheet>
      )}
    </div>
  )
}
