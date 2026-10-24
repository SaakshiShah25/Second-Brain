import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeftRight,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  Mail,
  Sunrise,
  TriangleAlert,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMorningBrief, useSendBriefEmail } from '../api/brief'
import { useCalendarStatus, useStartCalendarConnect } from '../api/calendar'
import { useGoogleStatus } from '../api/google'
import {
  useAddTaskToCalendar,
  useRemoveTaskFromCalendar,
  useStalePeople,
  useTasks,
  useUpdateTaskOwner,
  useUpdateTaskStatus,
} from '../api/tasks'
import type { Task, TaskFilter } from '../api/types'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import Chip, { ChipRow } from '../components/Chip'
import { Input, Label } from '../components/fields'
import PageHeader from '../components/PageHeader'
import Segmented from '../components/Segmented'
import Sheet from '../components/Sheet'
import { friendlyDate } from '../lib/dates'
import { useUsageMode } from '../lib/usageMode'

function MorningBriefCard() {
  const { data, isLoading } = useMorningBrief()
  const sendEmail = useSendBriefEmail()
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
          <Sunrise size={18} strokeWidth={2} />
        </span>
        <h2 className="flex-1 text-[0.9375rem] font-semibold">Morning brief</h2>
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data?.brief ?? ''}</ReactMarkdown>
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

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'due_soon', label: 'Due soon' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All' },
]

function isOverdue(task: Task): boolean {
  return task.status === 'open' && !!task.due_date && task.due_date < new Date().toISOString().slice(0, 10)
}

// "Unknown" is a placeholder for "a person was involved but wasn't
// named" - showing the literal word reads as broken, so treat it like no
// person at all and fall through to the initiative instead.
function realName(name: string | null | undefined): string | undefined {
  return name && name.trim().toLowerCase() !== 'unknown' ? name : undefined
}

// Who/what a task is about, for its subtitle line. Prefers the task's own
// directly-linked person; only defaults to the note's PRIMARY person when
// THEY own the task (for a task I own with no one named - e.g. my trainer
// says I should buy new gear - that's mine, not theirs, so fall through
// to the note's initiative). "For X" on my own tasks makes it explicit
// that I owe it to them, not the other way round.
function taskContext(task: Task): string {
  const personLabel =
    realName(task.person?.name) ?? (task.owner === 'them' ? realName(task.interaction?.person?.name) : undefined)
  if (!personLabel) return task.interaction?.initiative?.name ?? 'Personal'
  return task.owner === 'me' ? `For ${personLabel}` : `${personLabel} owes you`
}

type OwnerFilter = 'all' | 'me' | 'them'

const STALE_PRESETS = [
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
]

function todayHeading() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function DigestPage() {
  const [filter, setFilter] = useState<TaskFilter>('open')
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all')
  const [threshold, setThreshold] = useState(30)
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const usage = useUsageMode()
  // Wording follows what the account is used for.
  const copy = {
    work: { tasks: 'Follow-ups', reconnect: 'Contacts going cold', reconnectSub: "People you haven't been in touch with lately.", schedule: 'Schedule a meeting' },
    personal: { tasks: 'To-dos', reconnect: 'Catch up with', reconnectSub: "Friends and family you haven't seen in a while.", schedule: 'Add to calendar' },
    both: { tasks: 'Follow-ups', reconnect: 'Reconnect', reconnectSub: "People you haven't talked to in a while.", schedule: 'Schedule a meeting' },
  }[usage.mode]

  const { data, isLoading, error } = useTasks(filter)
  const visibleTasks = (data?.tasks ?? []).filter(
    (task) => filter !== 'open' || ownerFilter === 'all' || task.owner === ownerFilter,
  )
  const activeTask = (data?.tasks ?? []).find((t) => t.id === activeTaskId) ?? null
  const updateStatus = useUpdateTaskStatus()
  const updateOwner = useUpdateTaskOwner()
  const { data: stalePeople, isLoading: staleLoading } = useStalePeople(threshold)

  const { data: calendarStatus } = useCalendarStatus()
  const startConnect = useStartCalendarConnect()
  // No Google OAuth client on this server -> don't offer a connect button
  // that can only fail.
  const { data: google } = useGoogleStatus()
  const addToCalendar = useAddTaskToCalendar()
  const removeFromCalendar = useRemoveTaskFromCalendar()

  function openTask(task: Task) {
    setActiveTaskId(task.id)
    setScheduling(false)
    setScheduleDate(task.due_date ?? '')
  }

  const stats: { label: string; value: number | undefined; filter: TaskFilter; tone?: string }[] = [
    { label: 'Overdue', value: data?.counts.overdue, filter: 'overdue', tone: 'text-danger' },
    { label: 'This week', value: data?.counts.due_soon, filter: 'due_soon' },
    { label: 'Open', value: data?.counts.open, filter: 'open' },
  ]

  return (
    <div>
      <PageHeader title="Today" subtitle={todayHeading()} showProfile />

      <MorningBriefCard />

      <h2 className="mb-3 font-display text-[1.375rem] font-semibold tracking-[-0.025em]">{copy.tasks}</h2>

      {/* Tappable stat tiles - each one jumps the list to that filter. */}
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {stats.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setFilter(s.filter)}
            className={`pressable rounded-2xl border p-3 text-left ${
              filter === s.filter ? 'border-accent bg-accent-soft' : 'border-border bg-bg-card'
            }`}
          >
            <div className={`text-2xl font-semibold tabular-nums tracking-tight ${s.value ? s.tone ?? '' : ''}`}>
              {s.value ?? '–'}
            </div>
            <div className="text-[0.8125rem] text-text-muted">{s.label}</div>
          </button>
        ))}
      </div>

      <ChipRow className="mb-3">
        {FILTERS.map((f) => (
          <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
            {f.value === 'done' && data?.counts.done ? (
              <span className="text-xs opacity-60">{data.counts.done}</span>
            ) : null}
          </Chip>
        ))}
      </ChipRow>

      {filter === 'open' && (
        <Segmented
          className="mb-4"
          value={ownerFilter}
          onChange={setOwnerFilter}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'me', label: 'I owe' },
            { value: 'them', label: 'They owe' },
          ]}
        />
      )}

      {error && <p className="text-sm text-danger">Couldn't load tasks: {String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!isLoading && visibleTasks.length === 0 && (
        <div className="mb-6 rounded-2xl border border-dashed border-border-strong py-8 text-center">
          <CheckCircle2 size={28} strokeWidth={1.6} className="mx-auto mb-2 text-success" />
          <p className="text-[0.9375rem] text-text-muted">
            {filter === 'open' || filter === 'overdue' || filter === 'due_soon' ? 'All clear here.' : 'Nothing here.'}
          </p>
        </div>
      )}

      {visibleTasks.length > 0 && (
        <div className="mb-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
          {visibleTasks.map((task) => {
            const overdue = isOverdue(task)
            const done = task.status === 'done'
            return (
              <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                {/* Things-style round checkbox, with a generous invisible
                    hit area around the visible 22px circle. */}
                <button
                  type="button"
                  onClick={() => updateStatus.mutate({ taskId: task.id, status: done ? 'open' : 'done' })}
                  disabled={updateStatus.isPending}
                  aria-label={done ? 'Reopen' : 'Mark done'}
                  className="-m-2 flex-shrink-0 p-2 disabled:cursor-not-allowed"
                >
                  <span
                    className={`flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full border-2 transition-colors ${
                      done
                        ? 'border-success bg-success text-white'
                        : task.owner === 'them'
                          ? 'border-them-task'
                          : 'border-text-faint'
                    }`}
                  >
                    {done && <Check size={13} strokeWidth={3} />}
                  </span>
                </button>
                <button type="button" onClick={() => openTask(task)} className="pressable min-w-0 flex-1 text-left">
                  <span className={`line-clamp-2 text-[0.9375rem] leading-snug ${done ? 'text-text-faint line-through' : ''}`}>
                    {task.description}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-text-muted">
                    <span className={`truncate ${task.owner === 'them' ? 'text-them-task' : ''}`}>{taskContext(task)}</span>
                    {task.due_date && (
                      <>
                        <span className="text-text-faint">·</span>
                        <span
                          className={`flex flex-shrink-0 items-center gap-1 whitespace-nowrap ${
                            overdue ? 'font-medium text-danger' : ''
                          }`}
                        >
                          {overdue && <TriangleAlert size={12} strokeWidth={2.2} />}
                          {friendlyDate(task.due_date)}
                        </span>
                      </>
                    )}
                    {task.calendar_event_id && <CalendarCheck size={13} strokeWidth={2} className="flex-shrink-0 text-link" />}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {google?.configured && calendarStatus && !calendarStatus.connected && (
        <div className="mb-8 rounded-2xl border border-border bg-bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#2563eb]/15 text-[#2563eb]">
              <Calendar size={18} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-semibold">Connect Google Calendar</p>
              <p className="mt-0.5 text-sm text-text-muted">Put any follow-up on your calendar in one tap.</p>
            </div>
          </div>
          <Button
            variant="secondary"
            block
            className="mt-3"
            onClick={() => startConnect.mutate()}
            disabled={startConnect.isPending}
          >
            {startConnect.isPending ? 'Connecting…' : 'Connect'}
          </Button>
          {/* Surface the real reason a /connect/start failed (e.g. the
              backend's Google OAuth env vars not configured) instead of
              the button just appearing to do nothing. */}
          {startConnect.isError && (
            <p className="mt-2 flex items-center gap-1.5 text-[0.8125rem] text-danger">
              <TriangleAlert size={13} strokeWidth={2} />
              {startConnect.error instanceof Error
                ? startConnect.error.message
                : "Couldn't start the connection — please try again."}
            </p>
          )}
        </div>
      )}

      <h2 className="mt-8 mb-1 font-display text-[1.375rem] font-semibold tracking-[-0.025em]">{copy.reconnect}</h2>
      <p className="mb-3 text-[0.9375rem] text-text-muted">{copy.reconnectSub}</p>

      <ChipRow className="mb-4">
        {STALE_PRESETS.map((p) => (
          <Chip key={p.days} active={threshold === p.days} onClick={() => setThreshold(p.days)}>
            {p.label}
          </Chip>
        ))}
      </ChipRow>

      {staleLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!staleLoading && stalePeople?.length === 0 && (
        <p className="py-4 text-[0.9375rem] text-text-muted">You're caught up with everyone. 🎉</p>
      )}
      {stalePeople && stalePeople.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
          {stalePeople.map((p) => (
            <Link
              key={p.id}
              to={`/people/${p.id}`}
              className="pressable flex w-28 flex-shrink-0 flex-col items-center rounded-2xl border border-border bg-bg-card px-2 py-3.5 text-center"
            >
              <Avatar id={p.id} name={p.name} />
              <span className="mt-2 w-full truncate text-sm font-medium">{p.name}</span>
              <span className="text-xs text-text-muted">{p.days_ago}d ago</span>
            </Link>
          ))}
        </div>
      )}

      {activeTask && (
        <Sheet onClose={() => setActiveTaskId(null)}>
          <p className="mb-1 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint">Follow-up</p>
          <p className="mb-1 text-lg leading-snug font-semibold">{activeTask.description}</p>
          <p className="mb-5 text-[0.9375rem] text-text-muted">
            {taskContext(activeTask)}
            {activeTask.due_date &&
              ` · ${isOverdue(activeTask) ? 'overdue, was due' : 'due'} ${friendlyDate(activeTask.due_date)}`}
          </p>

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
              {activeTask.owner === 'them' ? 'Actually, I owe this' : 'Actually, they owe this'}
            </Button>

            {calendarStatus?.connected &&
              activeTask.due_date &&
              (activeTask.calendar_event_id ? (
                <Button
                  size="lg"
                  block
                  disabled={removeFromCalendar.isPending}
                  onClick={() => removeFromCalendar.mutate(activeTask.id)}
                >
                  <CalendarCheck size={17} strokeWidth={2} />
                  {removeFromCalendar.isPending ? 'Removing…' : 'Remove from calendar'}
                </Button>
              ) : !scheduling ? (
                <Button size="lg" block onClick={() => setScheduling(true)}>
                  <CalendarPlus size={17} strokeWidth={2} /> {copy.schedule}
                </Button>
              ) : (
                // The meeting can land on any date up to the due date
                // (e.g. due by the 24th, meet on the 21st).
                <div className="mt-2 rounded-2xl bg-bg-elevated p-3.5">
                  <Label>Meeting date (due {friendlyDate(activeTask.due_date)})</Label>
                  <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1" onClick={() => setScheduling(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      className="flex-1"
                      disabled={addToCalendar.isPending || !scheduleDate}
                      onClick={() =>
                        addToCalendar.mutate(
                          { taskId: activeTask.id, eventDate: scheduleDate },
                          { onSuccess: () => setScheduling(false) },
                        )
                      }
                    >
                      {addToCalendar.isPending ? 'Scheduling…' : 'Add to calendar'}
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}
