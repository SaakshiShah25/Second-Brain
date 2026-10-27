import { useState, type FormEvent } from 'react'
import { Check, CheckCircle2, ChevronDown, ListChecks, MapPin, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { useDeleteInteraction, useUpdateInteraction } from '../api/notes'
import { useUpdateTaskStatus } from '../api/tasks'
import type { Interaction, Task } from '../api/types'
import { dueLabel, friendlyDate, isoLocal } from '../lib/dates'
import { notePoints } from '../lib/initiativeFilter'
import { getInitiativeStyle, initiativeBadgeStyle } from '../lib/initiativeStyle'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import Sheet from './Sheet'
import { Input, Label, Select, Textarea } from './fields'

function Section({ icon: Icon, title, items }: { icon: typeof CheckCircle2; title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint">
        <Icon size={14} strokeWidth={2} /> {title}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((d, i) => (
          <li key={i} className="flex gap-2.5 text-[0.9375rem] leading-snug">
            <span className="mt-[0.5rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-faint" />
            {d}
          </li>
        ))}
      </ul>
    </div>
  )
}

function TaskCheckbox({ task }: { task: Task }) {
  const updateStatus = useUpdateTaskStatus()
  const done = task.status === 'done'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        updateStatus.mutate({ taskId: task.id, status: done ? 'open' : 'done' })
      }}
      aria-label={done ? 'Reopen' : 'Mark done'}
      className="-m-1.5 flex-shrink-0 p-1.5"
    >
      <span
        className={`flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded-[0.3rem] border-2 transition-colors ${
          done ? 'border-success bg-success text-white' : task.owner === 'them' ? 'border-them-task' : 'border-text-faint'
        }`}
      >
        {done && <Check size={11} strokeWidth={3.2} />}
      </span>
    </button>
  )
}

// One tickable task line - used on the card and in the open note.
export function TaskLine({ task, onOpen }: { task: Task; onOpen?: () => void }) {
  const done = task.status === 'done'
  const overdue = !done && !!task.due_date && task.due_date < isoLocal(new Date())
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-[0.2rem]">
        <TaskCheckbox task={task} />
      </span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left text-[0.9375rem] leading-snug">
        <span className={done ? 'text-text-faint line-through' : ''}>{task.description}</span>
        {(task.due_date || task.owner === 'them') && !done && (
          <span className={`ml-1.5 whitespace-nowrap text-[0.8125rem] ${overdue ? 'font-medium text-danger' : 'text-text-muted'}`}>
            {task.owner === 'them' ? 'waiting' : ''}
            {task.owner === 'them' && task.due_date ? ' · ' : ''}
            {task.due_date ? dueLabel(task.due_date, task.due_time) : ''}
          </span>
        )}
      </button>
    </li>
  )
}

export function Points({ points, max }: { points: string[]; max?: number }) {
  const shown = max ? points.slice(0, max) : points
  return (
    <ul className="flex flex-col gap-1">
      {shown.map((p, i) => (
        <li key={i} className="flex gap-2.5 text-[0.9375rem] leading-snug">
          <span className="mt-[0.5rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-faint" />
          <span className={max ? 'line-clamp-2' : ''}>{p}</span>
        </li>
      ))}
    </ul>
  )
}

const CARD_TASKS = 4

// A note as short bullet points plus its tasks as tick boxes, so it can be
// read and acted on at a glance; tapping opens the whole note in a bottom
// sheet, where Edit and Delete live.
export default function InteractionCard({ interaction, tasks = [] }: { interaction: Interaction; tasks?: Task[] }) {
  const updateInteraction = useUpdateInteraction()
  const deleteInteraction = useDeleteInteraction()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  // react-query dedupes this against the page's own useInitiatives() call.
  const { data: initiatives } = useInitiatives()

  const initiativeStyle = getInitiativeStyle(interaction.initiative)
  const points = notePoints(interaction.summary)

  const [form, setForm] = useState({
    date: interaction.date ?? '',
    location: interaction.location ?? '',
    points: points.join('\n'),
    raw_text: interaction.raw_text ?? '',
    decisions: (interaction.decisions ?? []).join('\n'),
    concerns: (interaction.concerns ?? []).join('\n'),
    initiative_id: interaction.initiative_id,
  })

  function handleSave(e: FormEvent) {
    e.preventDefault()
    const lines = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean)
    const { points: pointText, ...rest } = form
    updateInteraction.mutate(
      {
        interactionId: interaction.id,
        fields: {
          ...rest,
          summary: lines(pointText).map((p) => `- ${p.replace(/^[-•*]\s+/, '')}`).join('\n'),
          date: form.date || null,
          decisions: lines(form.decisions),
          concerns: lines(form.concerns),
        },
      },
      { onSuccess: () => setEditing(false) },
    )
  }

  function close() {
    setOpen(false)
    setEditing(false)
  }

  // Open tasks first, then done ones; the card only has room for a few.
  const sortedTasks = [...tasks].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))
  const cardTasks = sortedTasks.slice(0, CARD_TASKS)
  const hiddenTasks = sortedTasks.length - cardTasks.length

  return (
    <>
      <div className="rounded-2xl border border-border bg-bg-card">
        <button type="button" onClick={() => setOpen(true)} className="pressable block w-full px-4 pt-3.5 pb-3 text-left">
          <div className="mb-2 flex items-center gap-2 text-[0.8125rem]">
            {initiativeStyle && interaction.initiative ? (
              <span className="flex min-w-0 items-center gap-1 font-medium" style={{ color: initiativeStyle.color }}>
                <initiativeStyle.Icon size={13} strokeWidth={2.2} className="flex-shrink-0" />
                <span className="truncate">{interaction.initiative.name}</span>
              </span>
            ) : (
              <span className="font-medium text-text-faint">Others</span>
            )}
            <span className="text-text-faint">·</span>
            <span className="flex-shrink-0 text-text-faint">{friendlyDate(interaction.date)}</span>
          </div>
          {points.length > 0 ? (
            <Points points={points} max={4} />
          ) : (
            <p className="line-clamp-2 text-[0.9375rem] leading-snug">{interaction.raw_text || '(empty note)'}</p>
          )}
        </button>
        {cardTasks.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-border px-4 py-3">
            {cardTasks.map((t) => (
              <TaskLine key={t.id} task={t} onOpen={() => setOpen(true)} />
            ))}
            {hiddenTasks > 0 && (
              <li>
                <button type="button" onClick={() => setOpen(true)} className="pressable pl-7 text-[0.8125rem] font-medium text-link">
                  +{hiddenTasks} more
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {open && (
        <Sheet onClose={updateInteraction.isPending ? undefined : close} tall>
          {!editing ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.8125rem]">
                {interaction.initiative && initiativeStyle && (
                  <span
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 font-medium"
                    style={initiativeBadgeStyle(initiativeStyle.color)}
                  >
                    <initiativeStyle.Icon size={13} strokeWidth={2} />
                    {interaction.initiative.name}
                  </span>
                )}
                <span className="rounded-full bg-bg-elevated px-2.5 py-1 font-medium text-text-muted">
                  {friendlyDate(interaction.date)}
                  {interaction.date ? ` · ${interaction.date}` : ''}
                </span>
              </div>

              {points.length > 0 ? (
                <Points points={points} />
              ) : (
                <p className="text-[0.9375rem] text-text-muted">(no summary)</p>
              )}

              {sortedTasks.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 flex items-center gap-1.5 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint">
                    <ListChecks size={14} strokeWidth={2} /> Tasks
                  </p>
                  <ul className="flex flex-col gap-2.5">
                    {sortedTasks.map((t) => (
                      <TaskLine key={t.id} task={t} />
                    ))}
                  </ul>
                </div>
              )}

              {(interaction.location || interaction.maps_url) && (
                <div className="mt-4 flex flex-col gap-1 text-sm text-text-muted">
                  {interaction.location && (
                    <p className="flex items-center gap-1">
                      <MapPin size={14} strokeWidth={2} className="flex-shrink-0" />
                      {interaction.location}
                    </p>
                  )}
                  {interaction.maps_url && (
                    <a
                      href={interaction.maps_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-link"
                    >
                      <MapPin size={14} strokeWidth={2} className="flex-shrink-0" />
                      {interaction.geo_address ??
                        `${interaction.geo_lat?.toFixed(5)}, ${interaction.geo_lng?.toFixed(5)}`}
                    </a>
                  )}
                </div>
              )}

              <Section icon={CheckCircle2} title="Decisions" items={interaction.decisions ?? []} />
              <Section icon={TriangleAlert} title="Concerns" items={interaction.concerns ?? []} />
              {interaction.raw_text && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setShowRaw((v) => !v)}
                    aria-expanded={showRaw}
                    className="pressable mb-1.5 flex items-center gap-1 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint"
                  >
                    What you said
                    <ChevronDown size={14} strokeWidth={2.2} className={showRaw ? 'rotate-180' : ''} />
                  </button>
                  {showRaw && <p className="whitespace-pre-wrap rounded-xl bg-bg-elevated p-3.5 text-[0.9375rem] leading-relaxed text-text-muted">
                    {interaction.raw_text}
                  </p>}
                </div>
              )}

              <div className="mt-6 flex gap-2">
                <Button className="flex-1" onClick={() => setEditing(true)}>
                  <Pencil size={16} strokeWidth={2} /> Edit
                </Button>
                <Button variant="danger" className="flex-1" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={16} strokeWidth={2} /> Delete
                </Button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col gap-3.5">
              <h3 className="text-lg font-semibold tracking-tight">Edit note</h3>
              <div>
                <Label>Key points (one per line)</Label>
                <Textarea rows={4} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <Label>Initiative</Label>
                <Select
                  value={form.initiative_id ?? ''}
                  onChange={(e) => setForm({ ...form, initiative_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Others</option>
                  {initiatives?.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <Label>Decisions (one per line)</Label>
                <Textarea rows={2} value={form.decisions} onChange={(e) => setForm({ ...form, decisions: e.target.value })} />
              </div>
              <div>
                <Label>Concerns (one per line)</Label>
                <Textarea rows={2} value={form.concerns} onChange={(e) => setForm({ ...form, concerns: e.target.value })} />
              </div>
              <div>
                <Label>What you said</Label>
                <Textarea rows={4} value={form.raw_text} onChange={(e) => setForm({ ...form, raw_text: e.target.value })} />
              </div>
              <div className="mt-1 flex gap-2">
                <Button type="button" className="flex-1" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" className="flex-1" disabled={updateInteraction.isPending}>
                  {updateInteraction.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </form>
          )}
        </Sheet>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this note?"
          message="This also deletes its tasks. This cannot be undone."
          confirmLabel="Delete note"
          busy={deleteInteraction.isPending}
          busyLabel="Deleting…"
          onConfirm={() => {
            deleteInteraction.mutate(interaction.id, {
              onSettled: () => {
                setConfirmDelete(false)
                close()
              },
            })
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
