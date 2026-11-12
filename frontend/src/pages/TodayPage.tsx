import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown } from 'lucide-react'
import { useDeleteItem, useTasks, useUpdateTaskStatus } from '../api/tasks'
import type { Task } from '../api/types'
import Button from '../components/Button'
import Chip, { ChipRow } from '../components/Chip'
import DragToSpace, { Draggable } from '../components/DragToSpace'
import InitiativeBar from '../components/InitiativeBar'
import ItemRow from '../components/ItemRow'
import ItemSheet from '../components/ItemSheet'
import PageHeader from '../components/PageHeader'
import TodayComposer from '../components/TodayComposer'
import QuickAdd from '../components/QuickAdd'
import { useConnection } from '../lib/connection'
import { isoLocal } from '../lib/dates'
import { matchesInitiative, useInitiativeFilter } from '../lib/initiativeFilter'
import { byDue, openCountsByInitiative, todayIso } from '../lib/items'
import { PRIORITY_RANK, priorityOf, taskInitiativeId } from '../lib/taskOptions'
import { useOpenItem } from '../lib/useOpenItem'

const UPCOMING_DAYS = 7
type View = 'today' | 'upcoming' | 'anytime'

// What you marked high first, then the nearest date and time.
const byPriorityThenDue = (a: Task, b: Task) => PRIORITY_RANK[priorityOf(a)] - PRIORITY_RANK[priorityOf(b)] || byDue(a, b) || a.id - b.id

function Section({ title, tasks, tone, ...rowProps }: {
  title: string
  tasks: Task[]
  tone?: 'danger'
  onToggle: (t: Task) => void
  onOpen: (t: Task) => void
  onSwipeRemove: (t: Task) => void
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
          <Draggable key={t.id} task={t}>
            <ItemRow task={t} showList compactDate {...rowProps} />
          </Draggable>
        ))}
      </div>
    </section>
  )
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-6 rounded-2xl border border-dashed border-border-strong px-6 py-8 text-center">
      <CheckCircle2 size={28} strokeWidth={1.6} className="mx-auto mb-2 text-success" />
      <p className="text-[0.9375rem] text-text-muted">{title}</p>
      <p className="mt-1 text-[0.8125rem] text-text-faint">{hint}</p>
    </div>
  )
}

// What needs me, across every space, in three views (the Things way): Today - overdue, due or reminded today, and
// anything marked high priority;
// Upcoming - what's dated from tomorrow on; Anytime - the to-dos with no date, which is where the old
// Tasks list went. Everything else (a movie, a book) lives in its space. The chips at the foot narrow
// any view to one space.
export default function TodayPage() {
  const { data, error, refetch, isFetching } = useTasks('all')
  const connection = useConnection()
  const offline = connection.offline || connection.unreachable
  const updateStatus = useUpdateTaskStatus()
  const deleteItem = useDeleteItem()
  // To-dos you just ticked stay where they were, struck through, until you swipe them away (or leave the page).
  const [justDone, setJustDone] = useState<Set<number>>(new Set())
  // The tab you were on survives leaving and coming back (it used to snap back to Today).
  const [view, setView] = useState<View>(() => {
    try {
      const saved = sessionStorage.getItem('confia.todayView')
      return saved === 'upcoming' || saved === 'anytime' ? saved : 'today'
    } catch {
      return 'today'
    }
  })
  useEffect(() => {
    try {
      sessionStorage.setItem('confia.todayView', view)
    } catch {
      // not remembered - fine
    }
  }, [view])
  const [showDone, setShowDone] = useState(false)
  const everything = data?.tasks ?? []
  const [initiativeFilter] = useInitiativeFilter('today')
  const all = everything.filter((t) => matchesInitiative(initiativeFilter, taskInitiativeId(t)))
  // An item opened from a link (a chat reply, an answer's source) opens whatever view it is in.
  const sheet = useOpenItem(everything)

  const today = todayIso()
  const horizon = (() => {
    const d = new Date()
    d.setDate(d.getDate() + UPCOMING_DAYS)
    return isoLocal(d)
  })()
  const open = all.filter((t) => t.status === 'open' || (t.status === 'done' && justDone.has(t.id)))
  const dated = open.filter((t) => t.due_date).sort(byPriorityThenDue)
  const overdue = dated.filter((t) => t.due_date! < today)
  const dueToday = dated.filter((t) => t.due_date === today)
  const soon = dated.filter((t) => t.due_date! > today && t.due_date! <= horizon)
  const later = dated.filter((t) => t.due_date! > horizon)
  // To-dos with no date, and not on a list (list entries stay in their space) - the Anytime view.
  const anytime = open.filter((t) => !t.due_date && !t.list_id).sort(byPriorityThenDue)
  // Today also holds anything you asked to be reminded about today (that isn't already due today or overdue).
  const remindedToday = open
    .filter((t) => !t.list_id && t.remind_on === today && !(t.due_date && t.due_date <= today))
    .sort(byPriorityThenDue)
  const todayItems = [...dueToday, ...remindedToday]
  // High-priority to-dos wherever they are in time (undated, or dated later) are pinned to Today; the ones already
  // overdue or due/reminded today are in those sections, so nothing shows twice.
  const shown = new Set([...overdue, ...todayItems].map((t) => t.id))
  const important = open.filter((t) => !t.list_id && priorityOf(t) === 'high' && !shown.has(t.id)).sort(byPriorityThenDue)
  const done = all.filter((t) => t.status === 'done' && !t.list_id && !justDone.has(t.id)).sort((a, b) => b.id - a.id).slice(0, 30)
  const rowProps = {
    onToggle: (t: Task) => {
      const finishing = t.status !== 'done'
      if (!t.repeat) setJustDone((prev) => new Set(finishing ? prev.add(t.id) : [...prev].filter((id) => id !== t.id)))
      updateStatus.mutate({ taskId: t.id, status: finishing ? 'done' : 'open', repeats: !!t.repeat })
    },
    onOpen: sheet.open,
    onSwipeRemove: (t: Task) => deleteItem.mutate(t.id),
  }
  const subtitle = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const counts: Record<View, number> = { today: overdue.length + todayItems.length + important.length, upcoming: soon.length + later.length, anytime: anytime.length }
  const VIEWS: { id: View; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'anytime', label: 'Anytime' },
  ]

  return (
    <DragToSpace tasks={everything}>
    <div className="flex flex-1 flex-col">
      <PageHeader title="Today" subtitle={subtitle} showProfile />

      <ChipRow className="mb-4">
        {VIEWS.map((v) => (
          <Chip key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
            {v.label}
            {counts[v.id] > 0 && <span className="text-[0.75rem] opacity-75">{counts[v.id]}</span>}
          </Chip>
        ))}
      </ChipRow>

      {!data && (
        <div className="py-8 text-center">
          {error ? (
            <>
              <p className="mb-3 text-[0.9375rem] text-text-muted">
                {offline ? "You're offline, so your list can't load right now." : "Couldn't load your list."}
              </p>
              <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? 'Trying…' : 'Try again'}
              </Button>
            </>
          ) : (
            <p className="text-[0.9375rem] text-text-muted">{offline ? "You're offline. Your list will appear when you're back online." : 'Loading…'}</p>
          )}
        </div>
      )}

      {data && view === 'today' && (
        <>
          {overdue.length + todayItems.length + important.length === 0 && (
            <Empty title="Nothing on your plate." hint="Say “remind me to…” or “every night…” on Home and it shows up here on its day." />
          )}
          <Section title="Overdue" tasks={overdue} tone="danger" {...rowProps} />
          <Section title="Today" tasks={todayItems} {...rowProps} />
          <Section title="High priority" tasks={important} {...rowProps} />
        </>
      )}

      {data && view === 'upcoming' && (
        <>
          {soon.length + later.length === 0 && <Empty title="Nothing coming up." hint="Things with a date, a birthday or a routine show up here before their day." />}
          <Section title="Next 7 days" tasks={soon} {...rowProps} />
          <Section title="Later" tasks={later} {...rowProps} />
        </>
      )}

      {data && view === 'anytime' && (
        <>
          <QuickAdd listId={null} placeholder="Add a to-do" filterScope="today" />
          {anytime.length === 0 && <Empty title="No loose to-dos." hint="Anything you need to do with no date lands here." />}
          <Section title="To-dos" tasks={anytime} {...rowProps} />
          {done.length > 0 && (
            <section className="mb-5">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                className="pressable mb-2 flex items-center gap-1.5 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint"
              >
                Completed <span className="font-medium normal-case tracking-normal">· {done.length}</span>
                <ChevronDown size={15} strokeWidth={2.2} className={showDone ? 'rotate-180' : ''} />
              </button>
              {showDone && (
                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
                  {done.map((t) => (
                    <ItemRow key={t.id} task={t} compactDate {...rowProps} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {sheet.active && <ItemSheet task={sheet.active} onClose={sheet.close} />}

      <InitiativeBar counts={openCountsByInitiative(everything)} scope="today" search={<TodayComposer />} />
    </div>
    </DragToSpace>
  )
}
