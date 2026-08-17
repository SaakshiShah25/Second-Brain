import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Calendar, CalendarCheck, CalendarPlus, CheckCircle2, Sunrise, TriangleAlert } from 'lucide-react'
import { useCalendarStatus, useStartCalendarConnect } from '../api/calendar'
import {
  useAddTaskToCalendar,
  useRemoveTaskFromCalendar,
  useStalePeople,
  useTasks,
  useUpdateTaskOwner,
  useUpdateTaskStatus,
} from '../api/tasks'
import type { TaskFilter } from '../api/types'
import Card from '../components/Card'
import Button from '../components/Button'

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_soon', label: 'Due soon' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All' },
]

function dueLabel(dueDate: string | null, status: 'open' | 'done'): { text: string; overdue: boolean } {
  if (!dueDate) return { text: 'no due date', overdue: false }
  const overdue = status === 'open' && dueDate < new Date().toISOString().slice(0, 10)
  return { text: overdue ? `overdue (${dueDate})` : `due ${dueDate}`, overdue }
}

export default function DigestPage() {
  const [filter, setFilter] = useState<TaskFilter>('open')
  const [threshold, setThreshold] = useState(30)

  const { data, isLoading, error } = useTasks(filter)
  const updateStatus = useUpdateTaskStatus()
  const updateOwner = useUpdateTaskOwner()
  const { data: stalePeople, isLoading: staleLoading } = useStalePeople(threshold)

  const { data: calendarStatus } = useCalendarStatus()
  const startConnect = useStartCalendarConnect()
  const addToCalendar = useAddTaskToCalendar()
  const removeFromCalendar = useRemoveTaskFromCalendar()

  // Landing back here after the Google OAuth redirect - see
  // api/routers/calendar.py's oauth_callback(). Shown once, then the
  // query param is cleared so a refresh doesn't keep re-showing it.
  const [searchParams, setSearchParams] = useSearchParams()
  const calendarResult = searchParams.get('calendar')
  function dismissCalendarResult() {
    const next = new URLSearchParams(searchParams)
    next.delete('calendar')
    setSearchParams(next, { replace: true })
  }

  return (
    <div>
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold">
        <Sunrise size={22} strokeWidth={2} className="text-accent" /> Digest
      </h1>

      {calendarResult === 'connected' && (
        <Card className="mb-4 flex items-center justify-between gap-3 border-green-600/40">
          <p className="flex items-center gap-1.5 text-sm">
            <CheckCircle2 size={15} strokeWidth={2} className="text-green-600" /> Google Calendar connected.
          </p>
          <Button onClick={dismissCalendarResult}>Dismiss</Button>
        </Card>
      )}
      {calendarResult === 'error' && (
        <Card className="mb-4 flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-sm text-danger">
            <TriangleAlert size={15} strokeWidth={2} /> Couldn't connect Google Calendar - please try again.
          </p>
          <Button onClick={dismissCalendarResult}>Dismiss</Button>
        </Card>
      )}

      {calendarStatus && !calendarStatus.connected && (
        <Card className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            Connect Google Calendar to add due-date reminders for individual tasks.
          </p>
          <Button variant="primary" onClick={() => startConnect.mutate()} disabled={startConnect.isPending}>
            <span className="flex items-center gap-1.5">
              <Calendar size={15} strokeWidth={2} /> Connect Google Calendar
            </span>
          </Button>
        </Card>
      )}

      <h2 className="mb-3 text-lg font-semibold">Tasks</h2>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="text-center">
          <div className="text-xs text-text-muted">Overdue</div>
          <div className="text-2xl font-bold">{data?.counts.overdue ?? '—'}</div>
        </Card>
        <Card className="text-center">
          <div className="text-xs text-text-muted">Due in 7 days</div>
          <div className="text-2xl font-bold">{data?.counts.due_soon ?? '—'}</div>
        </Card>
        <Card className="text-center">
          <div className="text-xs text-text-muted">Open</div>
          <div className="text-2xl font-bold">{data?.counts.open ?? '—'}</div>
        </Card>
        <Card className="text-center">
          <div className="text-xs text-text-muted">Done</div>
          <div className="text-2xl font-bold">{data?.counts.done ?? '—'}</div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              filter === f.value
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border-strong bg-bg-card text-text-muted hover:text-text'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-danger">Couldn't load tasks: {String(error)}</p>}
      {isLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!isLoading && data?.tasks.length === 0 && <p className="text-sm text-text-muted">Nothing here.</p>}

      <div className="mb-8 flex flex-col gap-2">
        {data?.tasks.map((task) => {
          const due = dueLabel(task.due_date, task.status)
          return (
            <Card key={task.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{task.description}</p>
                <p className="text-xs text-text-muted">
                  {task.interaction?.person?.name ?? 'Unknown'}
                  {task.interaction?.date ? ` · ${task.interaction.date}` : ''}
                </p>
              </div>
              <button
                type="button"
                title="Click to toggle who owns this follow-up"
                onClick={() =>
                  updateOwner.mutate({ taskId: task.id, owner: task.owner === 'them' ? 'me' : 'them' })
                }
                disabled={updateOwner.isPending}
                className={`flex-shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  task.owner === 'them'
                    ? 'border-border-strong bg-bg-card text-text-muted hover:text-text'
                    : 'border-accent bg-accent-soft text-accent'
                }`}
              >
                {task.owner === 'them' ? 'Them' : 'Me'}
              </button>
              <span className={`flex items-center gap-1 whitespace-nowrap text-xs ${due.overdue ? 'font-medium text-danger' : 'text-text-muted'}`}>
                {due.overdue && <TriangleAlert size={13} strokeWidth={2} />}
                {due.text}
              </span>
              {calendarStatus?.connected && task.due_date && (
                task.calendar_event_id ? (
                  <Button
                    onClick={() => removeFromCalendar.mutate(task.id)}
                    disabled={removeFromCalendar.isPending}
                    title="Remove from Google Calendar"
                  >
                    <span className="flex items-center gap-1">
                      <CalendarCheck size={14} strokeWidth={2} /> On Calendar
                    </span>
                  </Button>
                ) : (
                  <Button
                    onClick={() => addToCalendar.mutate(task.id)}
                    disabled={addToCalendar.isPending}
                    title="Add to Google Calendar"
                  >
                    <span className="flex items-center gap-1">
                      <CalendarPlus size={14} strokeWidth={2} /> Add to Calendar
                    </span>
                  </Button>
                )
              )}
              <Button
                onClick={() =>
                  updateStatus.mutate({ taskId: task.id, status: task.status === 'open' ? 'done' : 'open' })
                }
                disabled={updateStatus.isPending}
              >
                {task.status === 'open' ? 'Mark done' : 'Reopen'}
              </Button>
            </Card>
          )
        })}
      </div>

      <h2 className="mb-1 text-lg font-semibold">Relationships gone quiet</h2>
      <p className="mb-3 text-xs text-text-muted">Open their profile on the People page for a full "Get briefing".</p>

      <label className="mb-4 block text-sm">
        Flag people not contacted in the last{' '}
        <span className="font-semibold text-accent">{threshold}</span> days
        <input
          type="range"
          min={7}
          max={180}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="mt-2 w-full accent-accent"
        />
      </label>

      {staleLoading && <p className="text-sm text-text-muted">Loading…</p>}
      {!staleLoading && stalePeople?.length === 0 && (
        <p className="text-sm text-text-muted">No relationships have gone quiet by that threshold.</p>
      )}
      <div className="flex flex-col gap-2">
        {stalePeople?.map((p) => (
          <Link key={p.id} to={`/people/${p.id}`}>
            <Card className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {p.name}
                  {p.role || p.company ? (
                    <span className="font-normal text-text-muted"> — {[p.role, p.company].filter(Boolean).join(', ')}</span>
                  ) : null}
                </p>
              </div>
              <span className="whitespace-nowrap text-xs text-text-muted">
                Last talked {p.last_interaction_date} ({p.days_ago} days ago)
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
