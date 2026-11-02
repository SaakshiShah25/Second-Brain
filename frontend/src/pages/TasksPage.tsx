import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core'
import { ArrowLeftRight, Bell, Check, CheckCircle2, ChevronDown, ChevronRight, FolderInput, NotebookText, TriangleAlert } from 'lucide-react'
import { useEditTask, useTasks, useUpdateTaskFields, useUpdateTaskOwner, useUpdateTaskStatus } from '../api/tasks'
import type { Initiative, Task } from '../api/types'
import Button from '../components/Button'
import CategorySheet from '../components/CategorySheet'
import { Input, Label } from '../components/fields'
import InitiativeBar from '../components/InitiativeBar'
import PageHeader from '../components/PageHeader'
import { PriorityBars, PriorityFlag, ReminderSheet } from '../components/TaskOptions'
import Sheet from '../components/Sheet'
import { toast } from '../components/Toast'
import { useInitiatives } from '../api/initiatives'
import { useNotes } from '../api/notes'
import { useConnection } from '../lib/connection'
import { dueLabel, fullDate, isoLocal, shortDate } from '../lib/dates'
import { groupByInitiative } from '../lib/groupByInitiative'
import { matchesInitiative, notePoints, useInitiativeFilter } from '../lib/initiativeFilter'
import { getInitiativeStyle } from '../lib/initiativeStyle'
import { PRIORITIES, PRIORITY_RANK, priorityOf, taskInitiativeId, type Priority } from '../lib/taskOptions'

function isOverdue(task: Task): boolean {
  return task.status === 'open' && !!task.due_date && task.due_date < isoLocal(new Date())
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

// How long a task you just ticked stays in its list, shown struck through, before it moves to Completed.
const LINGER_MS = 1100

// Wraps an open task so it can be picked up (a press-and-hold on a phone, a drag with the mouse) and dropped on a
// category. Done tasks aren't draggable.
function DragWrap({ task, children }: { task: Task; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: task.status !== 'open' })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.35 : 1, touchAction: 'manipulation' }} className="outline-none">
      {children}
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
  onOpen,
  onPriority,
  onReminder,
  toggling,
}: {
  task: Task
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  onPriority: (task: Task, priority: Priority) => void
  onReminder: (task: Task) => void
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
            done ? 'border-success bg-success text-white' : ''
          } ${!done && task.owner === 'them' ? 'border-dashed' : ''}`}
          // The ring takes the task's priority colour (red high, amber normal, green low); a dashed ring = someone else owes it.
          style={done ? { animation: 'task-pop 0.3s ease-out' } : { borderColor: PRIORITIES.find((p) => p.value === priorityOf(task))!.color }}
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
          {task.remind_on && !done && (
            <span className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-accent">
              <Bell size={12} strokeWidth={2.2} />
              {shortDate(task.remind_on)}
            </span>
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
      {!done && (
        <div className="flex flex-shrink-0 items-center gap-1.5 self-start pt-0.5">
          <PriorityFlag priority={priorityOf(task)} onPick={(p) => onPriority(task, p)} />
          <button
            type="button"
            onClick={() => onReminder(task)}
            aria-label={task.remind_on ? `Reminder set for ${shortDate(task.remind_on)}. Change` : 'Remind me'}
            className="pressable -m-1 flex h-9 w-9 items-center justify-center rounded-full"
          >
            <Bell
              size={18}
              strokeWidth={2}
              style={task.remind_on ? { color: 'var(--sb-accent)', fill: 'var(--sb-accent)' } : { color: 'var(--sb-text-faint)' }}
            />
          </button>
        </div>
      )}
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
  onPriority: (task: Task, priority: Priority) => void
  onReminder: (task: Task) => void
  toggling: boolean
}) {
  const style = getInitiativeStyle(initiative)
  const { setNodeRef, isOver } = useDroppable({ id: `section:${initiative?.id ?? 0}` })
  return (
    <section
      ref={setNodeRef}
      className="-mx-2 mb-5 rounded-3xl px-2 py-1 transition-colors"
      style={isOver ? { backgroundColor: `${style?.color ?? '#78716c'}1f`, outline: `2px dashed ${style?.color ?? '#78716c'}` } : undefined}
      aria-label={title}
    >
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
          <DragWrap key={t.id} task={t}>
            <TaskRow task={t} {...rowProps} />
          </DragWrap>
        ))}
      </div>
    </section>
  )
}

// The category under the finger (or mouse) wins; if the pointer is over none, whichever the dragged card overlaps most.
const collide: CollisionDetection = (args) => {
  const under = pointerWithin(args)
  return under.length > 0 ? under : rectIntersection(args)
}

// While a task is being dragged: every category as a place to drop it (also the ones with no tasks yet).
function DropTray({ initiatives, currentId }: { initiatives: Initiative[]; currentId: number | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}>
      <div className="pointer-events-auto mx-auto max-w-[480px] rounded-2xl border border-border-strong bg-bg-card p-3 shadow-card" style={{ animation: 'fade-in 0.15s ease-out' }}>
        <p className="mb-2 text-[0.75rem] font-medium uppercase tracking-wide text-text-faint">Drop on a category</p>
        <div className="flex flex-wrap gap-2">
          {[...initiatives.map((i) => ({ id: i.id, name: i.name, initiative: i as Initiative | null })), { id: 0, name: 'Others', initiative: null }].map((c) => (
            <DropChip key={c.id} id={c.id} name={c.name} initiative={c.initiative} current={(currentId ?? 0) === c.id} />
          ))}
        </div>
      </div>
    </div>
  )
}

function DropChip({ id, name, initiative, current }: { id: number; name: string; initiative: Initiative | null; current: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cat:${id}` })
  const style = getInitiativeStyle(initiative)
  const color = style?.color ?? '#78716c'
  return (
    <span
      ref={setNodeRef}
      className="flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[0.9375rem] font-medium leading-none transition-transform"
      style={{
        color: isOver ? '#fff' : color,
        backgroundColor: isOver ? color : current ? `${color}1f` : undefined,
        borderColor: isOver ? color : `${color}66`,
        transform: isOver ? 'scale(1.06)' : undefined,
      }}
    >
      {style && <style.Icon size={15} strokeWidth={2.2} />}
      {name}
    </span>
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
  const inFocus = allTasks.filter((t) => matchesInitiative(initiativeFilter, taskInitiativeId(t)))
  const shown = inFocus.filter((t) => ownerFilter === 'all' || t.owner === ownerFilter)
  // Open tasks per initiative, for the chip counts.
  const openCounts = useMemo(() => {
    const map = new Map<number, number>()
    for (const t of allTasks) {
      if (t.status !== 'open') continue
      const key = taskInitiativeId(t) ?? -1
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [allTasks])
  const focusName =
    initiativeFilter === null ? null : initiativeFilter === -1 ? 'Others' : initiatives?.find((i) => i.id === initiativeFilter)?.name
  const focusNotes = (notes ?? []).filter((n) => matchesInitiative(initiativeFilter, n.initiative_id)).length
  // A task you just ticked stays in its list for a moment (struck through, green tick) so you see it get done.
  const [lingering, setLingering] = useState<Set<number>>(new Set())
  const lingerTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  useEffect(() => {
    const timers = lingerTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])
  const open = shown.filter((t) => t.status === 'open')
  const openAndLingering = shown.filter((t) => t.status === 'open' || lingering.has(t.id))
  // What you marked high comes first, then the nearest deadline.
  const byDue = (a: Task, b: Task) =>
    PRIORITY_RANK[priorityOf(a)] - PRIORITY_RANK[priorityOf(b)] ||
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
    (a.due_time ?? '99').localeCompare(b.due_time ?? '99')
  const groups = groupByInitiative(openAndLingering.slice().sort(byDue), initiatives ?? [], taskInitiativeId)
  const doneTasks = shown.filter((t) => t.status === 'done' && !lingering.has(t.id)).sort((a, b) => (b.due_date ?? '').localeCompare(a.due_date ?? ''))
  const editTask = useEditTask()
  const updateStatus = useUpdateTaskStatus()
  const updateOwner = useUpdateTaskOwner()
  const updateFields = useUpdateTaskFields()
  const [reminderTaskId, setReminderTaskId] = useState<number | null>(null)
  const [movingTaskId, setMovingTaskId] = useState<number | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const reminderTask = allTasks.find((t) => t.id === reminderTaskId) ?? null
  const movingTask = allTasks.find((t) => t.id === movingTaskId) ?? null
  const draggingTask = allTasks.find((t) => t.id === draggingId) ?? null
  // Press and hold (a phone) or drag (a mouse) to pick a task up; plain taps and scrolling still work.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  function setOption(task: Task, fields: Parameters<typeof updateFields.mutate>[0]['fields'], message: string) {
    updateFields.mutate(
      { taskId: task.id, fields },
      {
        onSuccess: () => toast(message),
        onError: (e) => toast(e instanceof Error && e.message ? e.message : "Couldn't update that task - please try again."),
      },
    )
  }
  const setPriority = (task: Task, priority: Priority) =>
    priority === priorityOf(task) ? undefined : setOption(task, { priority }, `${PRIORITIES.find((p) => p.value === priority)!.label} priority`)
  const setReminder = (task: Task, date: string | null) =>
    setOption(task, { remind_on: date }, date ? `Reminder set for ${shortDate(date)}, 9 AM` : 'Reminder removed')
  const moveTask = (task: Task, initiativeId: number | null) => {
    if (initiativeId === taskInitiativeId(task)) return
    const name = initiativeId === null ? 'Others' : initiatives?.find((i) => i.id === initiativeId)?.name ?? 'that category'
    setOption(task, { initiative_id: initiativeId }, `Moved to ${name}`)
  }

  function handleDragEnd(e: DragEndEvent) {
    setDraggingId(null)
    const task = allTasks.find((t) => t.id === e.active.id)
    const target = String(e.over?.id ?? '')
    // dropped on a category's list (`section:<id>`) or on its chip in the tray (`cat:<id>`); 0 = Others
    if (!task || !/^(cat|section):\d+$/.test(target)) return
    const id = Number(target.split(':')[1])
    moveTask(task, id === 0 ? null : id)
  }

  function stopLingering(taskId: number) {
    clearTimeout(lingerTimers.current.get(taskId))
    lingerTimers.current.delete(taskId)
    setLingering((prev) => {
      if (!prev.has(taskId)) return prev
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
  }

  // Ticks a task off (or reopens it) and says so: the row turns green and struck through for a moment, and a
  // note confirms where it went. Tapping the tick again while it lingers puts it back.
  function setTaskStatus(task: Task, status: 'open' | 'done', onSuccess?: () => void) {
    if (status === 'done') {
      setLingering((prev) => new Set(prev).add(task.id))
      lingerTimers.current.set(task.id, setTimeout(() => stopLingering(task.id), LINGER_MS))
    } else {
      stopLingering(task.id)
    }
    updateStatus.mutate(
      { taskId: task.id, status },
      {
        onSuccess: () => {
          toast(status === 'done' ? 'Task done · moved to Completed' : 'Moved back to open tasks')
          onSuccess?.()
        },
        onError: () => {
          stopLingering(task.id)
          toast("Couldn't update that task - please try again.")
        },
      },
    )
  }

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
    <DndContext sensors={sensors} collisionDetection={collide} onDragStart={(e) => setDraggingId(Number(e.active.id))} onDragEnd={handleDragEnd} onDragCancel={() => setDraggingId(null)}>
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
              onToggle: (t: Task) => setTaskStatus(t, t.status === 'done' ? 'open' : 'done'),
              onOpen: openTask,
              onPriority: setPriority,
              onReminder: (t: Task) => setReminderTaskId(t.id),
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

          {activeTask.status === 'open' && (
            <>
              <div className="mb-3">
                <p className="mb-1.5 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint">Priority</p>
                <div className="flex gap-2">
                  {PRIORITIES.map((p) => {
                    const active = priorityOf(activeTask) === p.value
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPriority(activeTask, p.value)}
                        aria-pressed={active}
                        className="pressable flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border text-[0.875rem] font-medium"
                        style={
                          active
                            ? { backgroundColor: p.color, borderColor: p.color, color: '#fff' }
                            : { borderColor: `${p.color}66`, color: p.color }
                        }
                      >
                        <PriorityBars priority={p.value} inverted={active} />
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="mb-4 flex gap-2">
                <Button className="flex-1" onClick={() => setReminderTaskId(activeTask.id)}>
                  <Bell size={16} strokeWidth={2} />
                  {activeTask.remind_on ? shortDate(activeTask.remind_on) : 'Remind me'}
                </Button>
                <Button className="flex-1" onClick={() => setMovingTaskId(activeTask.id)}>
                  <FolderInput size={16} strokeWidth={2} />
                  Move
                </Button>
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              size="lg"
              block
              disabled={updateStatus.isPending}
              onClick={() =>
                setTaskStatus(activeTask, activeTask.status === 'open' ? 'done' : 'open', () => setActiveTaskId(null))
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

      {reminderTask && (
        <ReminderSheet task={reminderTask} onPick={(date) => setReminder(reminderTask, date)} onClose={() => setReminderTaskId(null)} />
      )}
      {movingTask && (
        <CategorySheet
          title="Move this task to"
          currentId={taskInitiativeId(movingTask)}
          onClose={() => setMovingTaskId(null)}
          onPick={async (id) => {
            moveTask(movingTask, id)
            setActiveTaskId(null)
          }}
        />
      )}

      {draggingTask && <DropTray initiatives={initiatives ?? []} currentId={taskInitiativeId(draggingTask)} />}
      <DragOverlay dropAnimation={null}>
        {draggingTask && (
          <div className="rounded-2xl border border-border-strong bg-bg-card px-4 py-3 text-[0.9375rem] shadow-card">{draggingTask.description}</div>
        )}
      </DragOverlay>
    </div>
    </DndContext>
  )
}
