import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Check, CheckCircle2, ChevronDown, NotebookText, TriangleAlert } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { useEditTask, useTasks, useUpdateTaskOwner, useUpdateTaskStatus } from '../api/tasks'
import type { Initiative, Task } from '../api/types'
import Button from '../components/Button'
import { Input, Label } from '../components/fields'
import PageHeader from '../components/PageHeader'
import Sheet from '../components/Sheet'
import { dueLabel, fullDate, isoLocal } from '../lib/dates'
import { groupByInitiative } from '../lib/groupByInitiative'
import { getInitiativeStyle } from '../lib/initiativeStyle'
import { stripBullet } from '../lib/text'

function isOverdue(task: Task): boolean {
  return task.status === 'open' && !!task.due_date && task.due_date < isoLocal(new Date())
}

// The category a task belongs to (the category of the note it came from).
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
        <span className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-text-muted">
          {task.owner === 'them' && (
            <span className="truncate text-them-task">Waiting on someone else</span>
          )}
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

// A category heading (icon + name, in the category's colour) with its count, then its rows.
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
  const { data: initiatives = [] } = useInitiatives()
  const { data, isLoading, error } = useTasks('all')
  const allTasks = data?.tasks ?? []
  const activeTask = allTasks.find((t) => t.id === activeTaskId) ?? null

  // Grouped under the category of the note each task came from. Inside a group: the ones with
  // the nearest deadline first, those without a date last.
  const shown = allTasks.filter((t) => ownerFilter === 'all' || t.owner === ownerFilter)
  const open = shown.filter((t) => t.status === 'open')
  const byDue = (a: Task, b: Task) =>
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.due_time ?? '99').localeCompare(b.due_time ?? '99')
  const groups = groupByInitiative(open.slice().sort(byDue), initiatives, taskInitiativeId)
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

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[0.9375rem] text-text-muted">{open.length === 0 ? 'Nothing open' : `${open.length} open`}</p>
        <OwnerPills value={ownerFilter} onChange={setOwnerFilter} />
      </div>

      {error && <p className="text-sm text-danger">Couldn't load tasks: {String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!isLoading && !error && open.length === 0 && (
        <div className="mb-6 rounded-2xl border border-dashed border-border-strong py-8 text-center">
          <CheckCircle2 size={28} strokeWidth={1.6} className="mx-auto mb-2 text-success" />
          <p className="text-[0.9375rem] text-text-muted">All clear. Nothing waiting on anyone.</p>
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
                  {stripBullet(activeTask.interaction.summary) || 'View the note'}
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
