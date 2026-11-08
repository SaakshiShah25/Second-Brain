import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Bell, Check, ChevronRight, FolderInput, NotebookText, Trash2 } from 'lucide-react'
import { useDeleteItem, useEditTask, useUpdateTaskFields, useUpdateTaskOwner, useUpdateTaskStatus } from '../api/tasks'
import { useMoveItem } from '../lib/useMoveItem'
import { useInitiatives } from '../api/initiatives'
import { useLists } from '../api/lists'
import type { Task } from '../api/types'
import { dueLabel, fullDate, shortDate, timeLabel } from '../lib/dates'
import { notePoints } from '../lib/initiativeFilter'
import { autoReminderText, isOverdue, REPEAT_OPTIONS, repeatLabel } from '../lib/items'
import { DEFAULT_REMIND_TIME, PRIORITIES, ON_PRIORITY, priorityOf, taskInitiativeId, tint } from '../lib/taskOptions'
import Button from './Button'
import CategorySheet from './CategorySheet'
import { beforeLabel, PriorityBars, ReminderSheet } from './TaskOptions'
import ConfirmDialog from './ConfirmDialog'
import Sheet from './Sheet'
import { toast } from './Toast'
import { Input, Label, Select, Textarea } from './fields'

// One item, opened from any list or from Today: what it is, where it came from, and everything
// you can do to it - tick it off, edit it (wording, date, time, repeat, list, detail), flip who
// owes it, delete it.
export default function ItemSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: lists = [] } = useLists()
  const editTask = useEditTask()
  const updateStatus = useUpdateTaskStatus()
  const updateOwner = useUpdateTaskOwner()
  const deleteItem = useDeleteItem()
  const updateFields = useUpdateTaskFields()
  const { move, prompt: movePrompt } = useMoveItem()
  const { data: initiatives = [] } = useInitiatives()
  const [choosingCategory, setChoosingCategory] = useState(false)
  const [choosingReminder, setChoosingReminder] = useState(false)
  const priority = priorityOf(task)
  const early = task.remind_before ? `${beforeLabel(task.remind_before)} before it's due` : ''
  const reminder = [
    early,
    task.remind_on ? `${shortDate(task.remind_on)}, ${timeLabel((task.remind_time ?? DEFAULT_REMIND_TIME).slice(0, 5))}` : early ? '' : autoReminderText(task),
  ]
    .filter(Boolean)
    .join(' · ')
  const categoryId = taskInitiativeId(task)
  const categoryName = categoryId === null ? 'Others' : (initiatives.find((i) => i.id === categoryId)?.name ?? 'Others')
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState({ description: '', date: '', time: '', repeat: '', listId: '', detail: '' })
  const list = task.item_list
  const isTodo = !list

  function startEditing() {
    setForm({
      description: task.description,
      date: task.due_date ?? '',
      time: (task.due_time ?? '').slice(0, 5),
      repeat: task.repeat ?? '',
      listId: task.list_id ? String(task.list_id) : '',
      detail: task.detail ?? '',
    })
    setEditing(true)
  }

  function save() {
    editTask.mutate(
      {
        taskId: task.id,
        description: form.description.trim(),
        due_date: form.date || null,
        // A routine with no start date starts today (the server fills it in), so it can keep a time.
        due_time: (form.date || form.repeat) && form.time ? form.time : null,
        repeat: form.repeat || null,
        list_id: form.listId ? Number(form.listId) : null,
        detail: form.detail.trim() || null,
      },
      { onSuccess: () => setEditing(false) },
    )
  }

  const meta = [
    list ? `${list.emoji ? `${list.emoji} ` : ''}${list.name}` : 'Tasks',
    task.due_date ? `${isOverdue(task) ? 'overdue, was due' : 'due'} ${dueLabel(task.due_date, task.due_time)}` : '',
    repeatLabel(task.repeat),
  ].filter(Boolean)

  return (
    <>
      <Sheet onClose={onClose}>
        <p className="mb-1 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint">{isTodo ? 'Task' : 'Item'}</p>
        <p className="mb-1 text-lg leading-snug font-semibold">{task.description}</p>
        <p className="mb-4 text-[0.9375rem] text-text-muted">{meta.join(' · ')}</p>
        {task.detail && !editing && <p className="mb-4 whitespace-pre-wrap text-[0.9375rem] leading-relaxed">{task.detail}</p>}

        {/* A list entry has neither: it is just on the list (tick it, or not). */}
        {!task.list_id && (
          <>
        {/* How much it matters, and when to be nudged - the same two for every kind of item. */}
        <div className="mb-3 flex gap-1.5" role="group" aria-label="Priority">
          {PRIORITIES.map((p) => {
            const active = priority === p.value
            return (
              <button
                key={p.value}
                type="button"
                disabled={updateFields.isPending}
                onClick={() => !active && updateFields.mutate({ taskId: task.id, fields: { priority: p.value } })}
                className="pressable flex h-10 flex-1 items-center justify-center gap-1 rounded-full border text-[0.8125rem] font-semibold disabled:opacity-60"
                style={active ? { backgroundColor: p.color, borderColor: p.color, color: ON_PRIORITY } : { borderColor: tint(p.color, 45), color: p.color }}
              >
                <PriorityBars priority={p.value} inverted={active} />
                {p.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setChoosingReminder(true)}
          className="pressable mb-3 flex w-full items-center gap-3 rounded-2xl border border-border bg-bg-elevated px-3.5 py-3 text-left"
        >
          <Bell size={17} strokeWidth={2} className="flex-shrink-0 text-text-muted" style={task.remind_on ? { color: 'var(--sb-accent)' } : undefined} />
          <span className="min-w-0 flex-1 text-[0.9375rem]">
            <span className="text-text-muted">Reminder · </span>
            <span className="font-medium">{reminder || 'None - tap to set one'}</span>
          </span>
          <ChevronRight size={16} strokeWidth={2} className="flex-shrink-0 text-text-faint" />
        </button>

          </>
        )}

        {/* Which space it belongs to - one tap to change it. */}
        <button
          type="button"
          onClick={() => setChoosingCategory(true)}
          className="pressable mb-4 flex w-full items-center gap-3 rounded-2xl border border-border bg-bg-elevated px-3.5 py-3 text-left"
        >
          <FolderInput size={17} strokeWidth={2} className="flex-shrink-0 text-text-muted" />
          <span className="min-w-0 flex-1 text-[0.9375rem]">
            <span className="text-text-muted">Space · </span>
            <span className="font-medium">{categoryName}</span>
          </span>
          <ChevronRight size={16} strokeWidth={2} className="flex-shrink-0 text-text-faint" />
        </button>

        {/* Where this item came from - tap to read (and edit) that note. */}
        {task.interaction && (
          <button
            type="button"
            onClick={() => navigate(`/notes?open=${task.interaction!.id}`)}
            className="pressable mb-4 flex w-full items-start gap-3 rounded-2xl border border-border bg-bg-elevated p-3.5 text-left"
          >
            <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-bg-card text-text-muted">
              <NotebookText size={17} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.75rem] font-medium uppercase tracking-wide text-text-faint">
                From a note · {fullDate(task.interaction.date)}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-[0.9375rem] leading-snug text-text">
                {notePoints(task.interaction.summary).join(' · ') || 'View the note'}
              </span>
              <span className="mt-1 block text-[0.8125rem] font-medium text-link">View the note</span>
            </span>
          </button>
        )}

        {editing ? (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-bg-elevated p-3.5">
            <div>
              <Label>{isTodo ? 'What needs doing' : 'What it is'}</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <Label>Time (optional)</Label>
                <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} disabled={!form.date && !form.repeat} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Repeats</Label>
                <Select value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })}>
                  <option value="">Never</option>
                  {REPEAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>List</Label>
                <Select value={form.listId} onChange={(e) => setForm({ ...form, listId: e.target.value })}>
                  <option value="">Tasks</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.emoji ? `${l.emoji} ` : ''}
                      {l.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label>Details (optional)</Label>
              <Textarea rows={2} value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
            </div>
            {editTask.isError && (
              <p className="text-[0.8125rem] text-danger">
                {editTask.error instanceof Error ? editTask.error.message : "Couldn't save that - please try again."}
              </p>
            )}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" className="flex-1" disabled={editTask.isPending || !form.description.trim()} onClick={save}>
                {editTask.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={startEditing} className="pressable mb-4 text-[0.9375rem] font-medium text-link">
            Edit, set a date or a repeat, or move it
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
                { taskId: task.id, status: task.status === 'open' ? 'done' : 'open', repeats: !!task.repeat },
                { onSuccess: onClose },
              )
            }
          >
            <Check size={18} strokeWidth={2.4} />
            {task.status === 'done' ? 'Reopen' : task.repeat ? 'Done for now' : 'Mark done'}
          </Button>
          {isTodo && (
            <Button
              size="lg"
              block
              disabled={updateOwner.isPending}
              onClick={() => updateOwner.mutate({ taskId: task.id, owner: task.owner === 'them' ? 'me' : 'them' })}
            >
              <ArrowLeftRight size={17} strokeWidth={2} />
              {task.owner === 'them' ? 'Actually, I owe this' : 'Actually, someone else owes this'}
            </Button>
          )}
          <Button variant="ghost" size="lg" block onClick={() => setConfirmDelete(true)}>
            <Trash2 size={17} strokeWidth={2} />
            Delete
          </Button>
        </div>
      </Sheet>

      {choosingReminder && (
        <ReminderSheet
          task={task}
          onClose={() => setChoosingReminder(false)}
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
              {
                onSuccess: () => toast(date ? `Reminder set for ${shortDate(date)}, ${timeLabel(time ?? DEFAULT_REMIND_TIME)}` : 'Reminder removed'),
              },
            )
          }
        />
      )}

      {choosingCategory && (
        <CategorySheet
          title="Which space does this belong to?"
          currentId={categoryId}
          onClose={() => setChoosingCategory(false)}
          onPick={async (id) => {
            await move(task, id)
          }}
        />
      )}
      {movePrompt}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete this ${isTodo ? 'task' : 'item'}?`}
          message="This cannot be undone."
          confirmLabel="Delete"
          busy={deleteItem.isPending}
          busyLabel="Deleting…"
          onConfirm={() =>
            deleteItem.mutate(task.id, {
              onSettled: () => {
                setConfirmDelete(false)
                onClose()
              },
            })
          }
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
