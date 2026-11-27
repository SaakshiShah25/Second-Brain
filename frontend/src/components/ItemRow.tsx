import { useState } from 'react'
import { Bell, Check, Repeat as RepeatIcon, Trash2, TriangleAlert } from 'lucide-react'
import type { Task } from '../api/types'
import { datedLabel, dueLabel, isoLocal, midSentence, timeLabel } from '../lib/dates'
import { isOverdue, repeatLabel } from '../lib/items'
import { bellLabel, reminderComing } from '../lib/dueReminder'
import { PRIORITIES, priorityOf } from '../lib/taskOptions'
import { remindedOnly, timeSlot, timeToday } from '../lib/timeline'
import ConfirmDialog from './ConfirmDialog'
import SwipeToRemove from './SwipeToRemove'
import DueReminderSheet from './DueReminderSheet'

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
  timeline = false,
  onDelete,
  onSwipeRemove,
  swipe = true,
}: {
  task: Task
  onToggle: (task: Task) => void
  onOpen: (task: Task) => void
  toggling?: boolean
  showList?: boolean
  // "Today, 4:00 PM" / "Thursday" instead of the full calendar date.
  compactDate?: boolean
  // The Today view: when it is sits in a column on the right (lib/timeline) instead of under the wording.
  timeline?: boolean
  // Editing a space: a remove button at the end of the row.
  onDelete?: (task: Task) => void
  // Swipe the row to the right to remove it. Done items stay in the list, struck through, until you do.
  onSwipeRemove?: (task: Task) => void
  // False where a sideways swipe means something else (the space page's swipeable Notes / To-dos / Lists): the row then
  // can't be swiped away on a phone, and is removed from edit mode instead. The laptop's hover bin still works.
  swipe?: boolean
}) {
  const [reminding, setReminding] = useState(false)
  // Swiping the row away, or its bin in edit mode, asks "Are you sure?" first.
  const [confirmRemove, setConfirmRemove] = useState(false)
  const overdue = isOverdue(task)
  // A task you marked high or low colours its tick circle (normal keeps the plain grey).
  const priority = priorityOf(task)
  const priorityColor = priority === 'normal' ? undefined : PRIORITIES.find((p) => p.value === priority)?.color
  const done = task.status === 'done'
  // A reminder that has already gone off is over: the card shows only ones still to come. That includes the one an item
  // with a due time gets on its own.
  const ringing = reminderComing(task)
  const list = task.item_list
  const slot = timeline ? timeSlot(task) : null
  // On Today only because of its reminder: the one case where the row spells the reminder out, as that is why it is here.
  const today = isoLocal(new Date())
  const reminderToday = timeline && remindedOnly(task, today) ? timeToday(task, today) : null
  const when = task.due_date
    ? compactDate
      ? [datedLabel(task.due_date), timeLabel(task.due_time)].filter(Boolean).join(', ')
      : dueLabel(task.due_date, task.due_time)
    : ''
  const facts = [
    reminderToday && !done ? (
      <span key="why" className="flex-shrink-0 whitespace-nowrap font-medium text-accent">
        {ringing ? 'Reminds you' : 'Reminded you'} today, {timeLabel(reminderToday)}
      </span>
    ) : null,
    // Always says "Due", so it can't be mistaken for the reminder.
    when && !timeline ? (
      <span key="d" className={`flex flex-shrink-0 items-center gap-1 whitespace-nowrap ${overdue ? 'font-medium text-danger' : ''}`}>
        {overdue && <TriangleAlert size={12} strokeWidth={2.2} />}
        Due {midSentence(when)}
      </span>
    ) : null,
    task.repeat ? (
      <span key="r" className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap">
        <RepeatIcon size={12} strokeWidth={2.2} />
        {repeatLabel(task.repeat)}
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
      {timeline && (
        // A fixed width, so every row's time starts and ends on the same lines.
        <button type="button" onClick={() => onOpen(task)} tabIndex={-1} className="w-[5.75rem] flex-shrink-0 text-right leading-tight">
          {slot && (
            <>
              <span
                className={`flex h-[1.3125rem] items-center justify-end whitespace-nowrap text-[0.8125rem] font-semibold tabular-nums ${
                  slot.tone === 'danger' ? 'text-danger' : slot.tone === 'faint' ? 'font-medium text-text-muted' : 'text-text'
                }`}
              >
                {slot.top}
              </span>
              {slot.bottom && (
                <span className={`mt-0.5 block whitespace-nowrap text-[0.75rem] tabular-nums ${slot.tone === 'danger' ? 'text-danger' : 'text-text-faint'}`}>{slot.bottom}</span>
              )}
            </>
          )}
        </button>
      )}
      {done && timeline && <span aria-hidden="true" className="w-[1.125rem] flex-shrink-0" />}
      {!done && (
        <button
          type="button"
          onClick={() => setReminding(true)}
          aria-label={ringing ? `${bellLabel(task)}. Change reminder` : 'Remind me'}
          data-tip={bellLabel(task)}
          // Always shown, so every row ends the same way: grey when nothing is set, filled orange when a reminder is coming.
          className={`tip tip-left pressable -m-2 flex-shrink-0 p-2 ${ringing ? 'text-accent' : 'text-text-faint lg:hover:text-accent'}`}
        >
          <span className="flex h-[1.3125rem] items-center">
            <Bell size={18} strokeWidth={1.9} fill={ringing ? 'currentColor' : 'none'} />
          </span>
        </button>
      )}
      {onSwipeRemove && !onDelete && (
        // Swiping needs a finger; a mouse gets a bin on every row (it asks "Are you sure?" like the swipe does).
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          aria-label={`Delete ${task.description}`}
          className="pressable -m-2 hidden flex-shrink-0 p-2 text-text-faint hover:text-danger lg:block"
        >
          <span className="flex h-[1.3125rem] items-center">
            <Trash2 size={17} strokeWidth={1.9} />
          </span>
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
      {onSwipeRemove && swipe ? <SwipeToRemove onRemove={() => setConfirmRemove(true)}>{row}</SwipeToRemove> : row}
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
          <DueReminderSheet task={task} onClose={() => setReminding(false)} />
        </div>
      )}
    </>
  )
}
