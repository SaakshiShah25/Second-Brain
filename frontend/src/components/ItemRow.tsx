import { useState } from 'react'
import { Bell, Check, Repeat as RepeatIcon, Trash2, TriangleAlert } from 'lucide-react'
import { useEditTask, useUpdateTaskFields } from '../api/tasks'
import type { Task } from '../api/types'
import { datedLabel, dueLabel, shortDate, timeLabel } from '../lib/dates'
import { isOverdue, repeatLabel } from '../lib/items'
import { DEFAULT_REMIND_TIME, PRIORITIES, priorityOf } from '../lib/taskOptions'
import ConfirmDialog from './ConfirmDialog'
import SwipeToRemove from './SwipeToRemove'
import { beforeLabel, ReminderSheet } from './TaskOptions'
import { toast } from './Toast'

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
  onDelete,
  onSwipeRemove,
}: {
  task: Task
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  toggling?: boolean
  showList?: boolean
  // "Today, 4:00 PM" / "Thursday" instead of the full calendar date.
  compactDate?: boolean
  // Editing a space: a remove button at the end of the row.
  onDelete?: (task: Task) => void
  // Swipe the row to the right to remove it. Done items stay in the list, struck through, until you do.
  onSwipeRemove?: (task: Task) => void
}) {
  const updateFields = useUpdateTaskFields()
  const editTask = useEditTask()
  const [reminding, setReminding] = useState(false)
  // Swiping the row away, or its bin in edit mode, asks "Are you sure?" first.
  const [confirmRemove, setConfirmRemove] = useState(false)
  const overdue = isOverdue(task)
  // A task you marked high or low colours its tick circle (normal keeps the plain grey).
  const priority = priorityOf(task)
  const priorityColor = priority === 'normal' ? undefined : PRIORITIES.find((p) => p.value === priority)?.color
  const done = task.status === 'done'
  const list = task.item_list
  const when = task.due_date
    ? compactDate
      ? [datedLabel(task.due_date), timeLabel(task.due_time)].filter(Boolean).join(', ')
      : dueLabel(task.due_date, task.due_time)
    : ''
  const facts = [
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
    task.remind_before && !done ? (
      <span key="e" className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-accent">
        <Bell size={12} strokeWidth={2.2} />
        {beforeLabel(task.remind_before)} before
      </span>
    ) : null,
    showList && list ? (
      <span key="l" className="min-w-0 truncate">
        {list.emoji ? `${list.emoji} ` : ''}
        {list.name}
      </span>
    ) : null,
  ].filter(Boolean)

  const row = (
    <div className="group flex items-start gap-3 px-4 py-3 lg:hover:bg-bg-hover">
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
            done ? 'border-success bg-success text-white' : priorityColor ? '' : 'border-text-faint'
          }`}
          style={!done && priorityColor ? { borderColor: priorityColor } : undefined}
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
      {!done && (
        <button
          type="button"
          onClick={() => setReminding(true)}
          aria-label={task.remind_on || task.remind_before ? 'Change reminder' : 'Remind me'}
          // On a laptop the bell stays out of the way until the row is hovered (or it already has a reminder).
          className={`pressable -m-2 flex-shrink-0 p-2 ${task.remind_on || task.remind_before ? 'text-accent' : 'text-text-faint lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100'}`}
        >
          <Bell size={18} strokeWidth={1.9} fill={task.remind_on || task.remind_before ? 'currentColor' : 'none'} />
        </button>
      )}
      {onSwipeRemove && !onDelete && (
        // Swiping needs a finger; with a mouse, a bin appears on hover (it asks "Are you sure?" like the swipe does).
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          aria-label={`Delete ${task.description}`}
          className="pressable -m-2 hidden flex-shrink-0 p-2 text-text-faint opacity-0 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 lg:block"
        >
          <Trash2 size={17} strokeWidth={1.9} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          aria-label={`Remove ${task.description}`}
          className="pressable -m-2 flex-shrink-0 p-2 text-text-faint hover:text-danger"
        >
          <Trash2 size={17} strokeWidth={1.9} />
        </button>
      )}
    </div>
  )
  return (
    <>
      {onSwipeRemove ? <SwipeToRemove onRemove={() => setConfirmRemove(true)}>{row}</SwipeToRemove> : row}
      {confirmRemove && (
        <div onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title="Delete this?"
            message={`“${task.description}” will be deleted${task.repeat ? ', along with its repeats' : ''}. This cannot be undone.`}
            confirmLabel="Delete"
            onCancel={() => setConfirmRemove(false)}
            onConfirm={() => {
              setConfirmRemove(false)
              ;(onSwipeRemove ?? onDelete)?.(task)
            }}
          />
        </div>
      )}
      {reminding && (
        // Events from a sheet bubble up through React to the row's drag handle; keep them from starting a drag.
        <div onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <ReminderSheet
          task={task}
          onClose={() => setReminding(false)}
          onPickDue={(date, time) =>
            editTask.mutate(
              { taskId: task.id, due_date: date, due_time: time },
              { onSuccess: () => toast(date ? `Due ${shortDate(date)}${time ? `, ${timeLabel(time)}` : ''}` : 'Due date removed') },
            )
          }
          onPickBefore={
            task.due_date
              ? (minutes) =>
                  updateFields.mutate(
                    { taskId: task.id, fields: { remind_before: minutes } },
                    { onSuccess: () => toast(minutes ? `You'll be reminded ${beforeLabel(minutes)} before` : 'Early reminder removed') },
                  )
              : undefined
          }
          onPick={(date, time) =>
            updateFields.mutate(
              { taskId: task.id, fields: { remind_on: date, remind_time: time } },
              { onSuccess: () => toast(date ? `Reminder set for ${shortDate(date)}, ${timeLabel(time ?? DEFAULT_REMIND_TIME)}` : 'Reminder removed') },
            )
          }
        />
        </div>
      )}
    </>
  )
}
