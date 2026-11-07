import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { useTasks, useUpdateTaskStatus } from '../api/tasks'
import type { Task } from '../api/types'
import Button from '../components/Button'
import ItemRow from '../components/ItemRow'
import ItemSheet from '../components/ItemSheet'
import PageHeader from '../components/PageHeader'
import { useConnection } from '../lib/connection'
import { isoLocal } from '../lib/dates'
import { byDue, todayIso } from '../lib/items'
import { useOpenItem } from '../lib/useOpenItem'

const UPCOMING_DAYS = 7

function Section({ title, tasks, tone, ...rowProps }: {
  title: string
  tasks: Task[]
  tone?: 'danger'
  onToggle: (t: Task) => void
  onOpen: (t: Task) => void
}) {
  if (tasks.length === 0) return null
  return (
    <section className="mb-5" aria-label={title}>
      <h3
        className={`mb-2 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide ${tone === 'danger' ? 'text-danger' : 'text-text-faint'}`}
      >
        {title}
        <span className="font-medium normal-case tracking-normal opacity-80"> · {tasks.length}</span>
      </h3>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
        {tasks.map((t) => (
          <ItemRow key={t.id} task={t} showList compactDate {...rowProps} />
        ))}
      </div>
    </section>
  )
}

// What needs me now, across every list: overdue, due today (timed ones first by time, then
// today's routines and dates), and the coming week - birthdays included. Undated items stay on
// their lists; this page is only about "when".
export default function TodayPage() {
  const { data, error, refetch, isFetching } = useTasks('all')
  const connection = useConnection()
  const offline = connection.offline || connection.unreachable
  const updateStatus = useUpdateTaskStatus()
  const all = data?.tasks ?? []
  const sheet = useOpenItem(all)

  const today = todayIso()
  const horizon = (() => {
    const d = new Date()
    d.setDate(d.getDate() + UPCOMING_DAYS)
    return isoLocal(d)
  })()
  const dated = all.filter((t) => t.status === 'open' && t.due_date).sort(byDue)
  const overdue = dated.filter((t) => t.due_date! < today)
  const dueToday = dated.filter((t) => t.due_date === today)
  const upcoming = dated.filter((t) => t.due_date! > today && t.due_date! <= horizon)
  const rowProps = {
    onToggle: (t: Task) => updateStatus.mutate({ taskId: t.id, status: t.status === 'done' ? 'open' : 'done', repeats: !!t.repeat }),
    onOpen: sheet.open,
  }
  const subtitle = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div>
      <PageHeader title="Today" subtitle={subtitle} showProfile />

      {!data && (
        <div className="py-8 text-center">
          {error ? (
            <>
              <p className="mb-3 text-[0.9375rem] text-text-muted">
                {offline ? "You're offline, so today's list can't load right now." : "Couldn't load today's list."}
              </p>
              <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? 'Trying…' : 'Try again'}
              </Button>
            </>
          ) : (
            <p className="text-[0.9375rem] text-text-muted">{offline ? "You're offline. Today's list will appear when you're back online." : 'Loading…'}</p>
          )}
        </div>
      )}

      {data && overdue.length + dueToday.length === 0 && (
        <div className="mb-6 rounded-2xl border border-dashed border-border-strong px-6 py-8 text-center">
          <CheckCircle2 size={28} strokeWidth={1.6} className="mx-auto mb-2 text-success" />
          <p className="text-[0.9375rem] text-text-muted">Nothing due today.</p>
          <p className="mt-1 text-[0.8125rem] text-text-faint">Say “remind me to…” or “every night…” on Home and it shows up here on its day.</p>
        </div>
      )}

      <Section title="Overdue" tasks={overdue} tone="danger" {...rowProps} />
      <Section title="Today" tasks={dueToday} {...rowProps} />
      <Section title="Coming up" tasks={upcoming} {...rowProps} />

      {data && (
        <Link to="/lists" className="pressable mb-5 flex items-center gap-2.5 rounded-xl bg-bg-elevated px-3.5 py-2.5 text-[0.9375rem]">
          <span className="min-w-0 flex-1 truncate text-text-muted">Everything without a date is in your lists</span>
          <ChevronRight size={17} strokeWidth={2} className="flex-shrink-0 text-text-faint" />
        </Link>
      )}

      {sheet.active && <ItemSheet task={sheet.active} onClose={sheet.close} />}
    </div>
  )
}
