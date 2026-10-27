import { useState } from 'react'
import {
  ArrowLeftRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Mail,
  RefreshCw,
  Sunrise,
  TriangleAlert,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMorningBrief, useRefreshBrief, useSendBriefEmail } from '../api/brief'
import { useEditTask, useTasks, useUpdateTaskOwner, useUpdateTaskStatus } from '../api/tasks'
import type { Task } from '../api/types'
import Button from '../components/Button'
import CalendarView from '../components/CalendarView'
import { Input, Label } from '../components/fields'
import PageHeader from '../components/PageHeader'
import Segmented from '../components/Segmented'
import Sheet from '../components/Sheet'
import { dueLabel, isoLocal } from '../lib/dates'
import { useUsageMode } from '../lib/usageMode'

function MorningBriefCard() {
  const { data, isLoading } = useMorningBrief()
  const sendEmail = useSendBriefEmail()
  const refresh = useRefreshBrief()
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
          <Sunrise size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[0.9375rem] font-semibold">Morning brief</h2>
          {data?.generated_at && (
            <p className="text-[0.75rem] leading-tight text-text-faint">
              As of {new Date(data.generated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          aria-label="Rewrite the brief from what is true now"
          title="Rewrite from what's true now"
          className="pressable flex h-9 w-9 items-center justify-center rounded-full text-text-muted disabled:opacity-50"
        >
          <RefreshCw size={16} strokeWidth={2} className={refresh.isPending ? 'animate-spin' : ''} />
        </button>
        {/* Already emailed automatically each morning (Settings >
            Notifications) - this is a manual resend. */}
        <button
          type="button"
          onClick={() => sendEmail.mutate()}
          disabled={sendEmail.isPending}
          aria-label="Email this brief to me now"
          className="pressable flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-link disabled:opacity-50"
        >
          <Mail size={16} strokeWidth={2} />
          {sendEmail.isPending ? 'Sending…' : 'Email'}
        </button>
      </div>
      {sendEmail.isSuccess && <p className="mb-2 text-[0.8125rem] text-success">Sent to {sendEmail.data.sent_to}.</p>}
      {sendEmail.isError && (
        <p className="mb-2 text-[0.8125rem] text-danger">
          {sendEmail.error instanceof Error ? sendEmail.error.message : 'Could not send the email.'}
        </p>
      )}
      {isLoading ? (
        <div className="flex flex-col gap-2 py-1">
          <span className="h-3 w-11/12 animate-pulse rounded-full bg-bg-elevated" />
          <span className="h-3 w-4/5 animate-pulse rounded-full bg-bg-elevated" />
          <span className="h-3 w-2/3 animate-pulse rounded-full bg-bg-elevated" />
        </div>
      ) : (
        <>
          <div
            className={`prose-chat relative text-[0.9375rem] leading-relaxed text-text ${
              expanded ? '' : 'max-h-40 overflow-hidden'
            }`}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // "Overdue (2)" gets its own heading in the warning colour so it can't be missed.
                h3: ({ children }) => {
                  const overdue = /^overdue/i.test(String(children))
                  return (
                    <h3 className={`mt-4 mb-1.5 flex items-center gap-1.5 text-[0.9375rem] font-semibold ${overdue ? 'text-danger' : ''}`}>
                      {overdue && <TriangleAlert size={16} strokeWidth={2.3} />}
                      {children}
                    </h3>
                  )
                },
              }}
            >
              {data?.brief ?? ''}
            </ReactMarkdown>
            {!expanded && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-bg-card to-transparent" />
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="pressable mt-1 flex items-center gap-1 text-sm font-medium text-link"
          >
            {expanded ? 'Show less' : 'Read full brief'}
            <ChevronDown size={16} strokeWidth={2} className={expanded ? 'rotate-180' : ''} />
          </button>
        </>
      )}
    </section>
  )
}

function isOverdue(task: Task): boolean {
  return task.status === 'open' && !!task.due_date && task.due_date < isoLocal(new Date())
}

// What a task belongs to, for its subtitle line: the category of the note
// it came from, or a nudge that someone else owes it.
function taskContext(task: Task): string {
  if (task.owner === 'them') return 'Waiting on someone else'
  return task.interaction?.initiative?.name ?? 'Personal'
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
          <span className={`truncate ${task.owner === 'them' ? 'text-them-task' : ''}`}>{taskContext(task)}</span>
          {task.due_date && (
            <>
              <span className="text-text-faint">·</span>
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

// A heading with its count, then its rows. Empty sections are not drawn at all.
function TaskSection({
  title,
  tasks,
  tone,
  ...rowProps
}: {
  title: string
  tasks: Task[]
  tone?: 'danger'
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  toggling: boolean
}) {
  if (tasks.length === 0) return null
  return (
    <section className="mb-5" aria-label={title}>
      <h3 className={`mb-2 flex items-center gap-1.5 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide ${tone === 'danger' ? 'text-danger' : 'text-text-faint'}`}>
        {tone === 'danger' && <TriangleAlert size={14} strokeWidth={2.4} />}
        {title}
        <span className="font-medium normal-case tracking-normal opacity-80">· {tasks.length}</span>
      </h3>
      <div
        className={`divide-y divide-border overflow-hidden rounded-2xl border bg-bg-card ${
          tone === 'danger' ? 'border-danger/40' : 'border-border'
        }`}
      >
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} {...rowProps} />
        ))}
      </div>
    </section>
  )
}

function todayHeading() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function DigestPage() {
  const [showCompleted, setShowCompleted] = useState(false)
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all')
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null)
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [editing, setEditing] = useState(false)
  const [editDesc, setEditDesc] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const usage = useUsageMode()
  // Wording follows what the account is used for.
  const copy = {
    work: { tasks: 'Tasks' },
    personal: { tasks: 'To-dos' },
    both: { tasks: 'Tasks' },
  }[usage.mode]

  const { data, isLoading, error } = useTasks('all')
  const allTasks = data?.tasks ?? []
  const activeTask = allTasks.find((t) => t.id === activeTaskId) ?? null

  // The list is sorted into sections by when each task is due, not filtered by tabs.
  const todayIso = isoLocal(new Date())
  const weekEnd = isoLocal(new Date(Date.now() + 7 * 86_400_000))
  const shown = allTasks.filter((t) => ownerFilter === 'all' || t.owner === ownerFilter)
  const open = shown.filter((t) => t.status === 'open')
  const byDue = (a: Task, b: Task) =>
    (a.due_date ?? '').localeCompare(b.due_date ?? '') || (a.due_time ?? '99').localeCompare(b.due_time ?? '99')
  const overdueTasks = open.filter((t) => t.due_date && t.due_date < todayIso).sort(byDue)
  const todayTasks = open.filter((t) => t.due_date === todayIso).sort(byDue)
  const weekTasks = open.filter((t) => t.due_date && t.due_date > todayIso && t.due_date <= weekEnd).sort(byDue)
  const laterTasks = open.filter((t) => t.due_date && t.due_date > weekEnd).sort(byDue)
  const undatedTasks = open.filter((t) => !t.due_date)
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
      <PageHeader title="Today" subtitle={todayHeading()} showProfile />

      <MorningBriefCard />

      <Segmented
        className="mb-5"
        value={view}
        onChange={setView}
        options={[
          { value: 'list', label: copy.tasks },
          { value: 'calendar', label: 'Calendar' },
        ]}
      />

      {view === 'calendar' ? (
        <CalendarView
          onOpenTask={(id) => {
            setActiveTaskId(id)
            setEditing(false)
          }}
        />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[0.9375rem] text-text-muted">
              {open.length === 0 ? 'Nothing open' : `${open.length} open`}
              {overdueTasks.length > 0 && <span className="font-medium text-danger"> · {overdueTasks.length} overdue</span>}
            </p>
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
                <TaskSection title="Overdue" tone="danger" tasks={overdueTasks} {...rowProps} />
                <TaskSection title="Today" tasks={todayTasks} {...rowProps} />
                <TaskSection title="Next 7 days" tasks={weekTasks} {...rowProps} />
                <TaskSection title="Later" tasks={laterTasks} {...rowProps} />
                <TaskSection title="No date" tasks={undatedTasks} {...rowProps} />
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
        </>
      )}

      {activeTask && (
        <Sheet onClose={() => setActiveTaskId(null)}>
          <p className="mb-1 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint">Task</p>
          <p className="mb-1 text-lg leading-snug font-semibold">{activeTask.description}</p>
          <p className="mb-5 text-[0.9375rem] text-text-muted">
            {taskContext(activeTask)}
            {activeTask.due_date &&
              ` · ${isOverdue(activeTask) ? 'overdue, was due' : 'due'} ${dueLabel(activeTask.due_date, activeTask.due_time)}`}
          </p>

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
