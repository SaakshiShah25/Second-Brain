import { Bell, Check, Repeat as RepeatIcon, TriangleAlert } from 'lucide-react'
import type { Task } from '../api/types'
import { dueLabel, friendlyDate, shortDate, timeLabel } from '../lib/dates'
import { isOverdue, repeatLabel } from '../lib/items'
import { PRIORITIES, priorityOf } from '../lib/taskOptions'

// One item: a Things-style round checkbox, its wording, and one quiet line of facts (whose it
// is, when, how often, which list). `showList` adds the list chip - on Today, where items from
// every list are mixed together.
export default function ItemRow({
  task,
  onToggle,
  onOpen,
  toggling = false,
  showList = false,
  compactDate = false,
}: {
  task: Task
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  toggling?: boolean
  showList?: boolean
  // "Today, 4:00 PM" / "Thursday" instead of the full calendar date.
  compactDate?: boolean
}) {
  const overdue = isOverdue(task)
  // A task you marked high or low colours its tick circle (normal keeps the plain grey).
  const priority = priorityOf(task)
  const priorityColor = priority === 'normal' ? undefined : PRIORITIES.find((p) => p.value === priority)?.color
  const done = task.status === 'done'
  const list = task.item_list
  const when = task.due_date
    ? compactDate
      ? [friendlyDate(task.due_date), timeLabel(task.due_time)].filter(Boolean).join(', ')
      : dueLabel(task.due_date, task.due_time)
    : ''
  const facts = [
    task.owner === 'them' && !list ? <span key="w" className="flex-shrink-0 text-them-task">Waiting</span> : null,
    when ? (
      <span key="d" className={`flex flex-shrink-0 items-center gap-1 whitespace-nowrap ${overdue ? 'font-medium text-danger' : ''}`}>
        {overdue && <TriangleAlert size={12} strokeWidth={2.2} />}
        {when}
      </span>
    ) : null,
    task.repeat ? (
      <span key="r" className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap">
        <RepeatIcon size={12} strokeWidth={2.2} />
        {repeatLabel(task.repeat)}
      </span>
    ) : null,
    task.remind_on && !done ? (
      <span key="b" className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-accent">
        <Bell size={12} strokeWidth={2.2} />
        {shortDate(task.remind_on)}
        {task.remind_time && `, ${timeLabel(task.remind_time.slice(0, 5))}`}
      </span>
    ) : null,
    showList && list ? (
      <span key="l" className="min-w-0 truncate">
        {list.emoji ? `${list.emoji} ` : ''}
        {list.name}
      </span>
    ) : null,
  ].filter(Boolean)

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {/* Generous invisible hit area around the visible 22px circle. */}
      <button
        type="button"
        onClick={() => onToggle(task)}
        disabled={toggling}
        aria-label={done ? 'Reopen' : task.repeat ? 'Done for now' : 'Mark done'}
        className="-m-2 flex-shrink-0 p-2 disabled:cursor-not-allowed"
      >
        <span
          className={`flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full border-2 transition-colors ${
            done ? 'border-success bg-success text-white' : task.owner === 'them' && !list ? 'border-them-task' : priorityColor ? '' : 'border-text-faint'
          }`}
          style={!done && priorityColor && !(task.owner === 'them' && !list) ? { borderColor: priorityColor } : undefined}
        >
          {done && <Check size={13} strokeWidth={3} />}
        </span>
      </button>
      <button type="button" onClick={() => onOpen(task)} className="pressable min-w-0 flex-1 text-left">
        <span className={`line-clamp-2 text-[0.9375rem] leading-snug ${done ? 'text-text-faint line-through' : ''}`}>
          {task.description}
        </span>
        {task.detail && !done && <span className="mt-0.5 line-clamp-1 block text-[0.8125rem] text-text-muted">{task.detail}</span>}
        {facts.length > 0 && (
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-text-muted">
            {facts.flatMap((f, i) => (i === 0 ? [f] : [<span key={`s${i}`} className="text-text-faint">·</span>, f]))}
          </span>
        )}
      </button>
    </div>
  )
}
