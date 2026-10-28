import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, ChevronDown, MapPin, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { useDeleteInteraction, useUpdateInteraction } from '../api/notes'
import type { Interaction } from '../api/types'
import { fullDate } from '../lib/dates'
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

// A note as short bullet points; tapping opens the whole note in a bottom
// sheet, where Edit and Delete live. (Its tasks live on the Tasks tab.)
//
// `autoOpen` opens it straight away (arriving from a task's "View the note"); `onClosed` tells the
// page the sheet was dismissed, so it can forget what it was asked to open.
export default function InteractionCard({
  interaction,
  autoOpen = false,
  onClosed,
}: {
  interaction: Interaction
  autoOpen?: boolean
  onClosed?: () => void
}) {
  const updateInteraction = useUpdateInteraction()
  const deleteInteraction = useDeleteInteraction()
  const [open, setOpen] = useState(autoOpen)
  const cardRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  // react-query dedupes this against the page's own useInitiatives() call.
  const { data: initiatives } = useInitiatives()

  const initiativeStyle = getInitiativeStyle(interaction.initiative)

  // Arriving from a task: bring the card into view behind the sheet.
  useEffect(() => {
    if (autoOpen) cardRef.current?.scrollIntoView({ block: 'center' })
  }, [autoOpen])
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
      // Done: leave the note rather than landing back on its Edit / Delete buttons.
      { onSuccess: () => close() },
    )
  }

  function close() {
    setOpen(false)
    setEditing(false)
    onClosed?.()
  }

  return (
    <>
      <div ref={cardRef} className="rounded-2xl border border-border bg-bg-card">
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
            <span className="flex-shrink-0 text-text-faint">{fullDate(interaction.date)}</span>
          </div>
          {points.length > 0 ? (
            <Points points={points} max={4} />
          ) : (
            <p className="line-clamp-2 text-[0.9375rem] leading-snug">{interaction.raw_text || '(empty note)'}</p>
          )}
        </button>
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
                  {fullDate(interaction.date)}
                </span>
              </div>

              {points.length > 0 ? (
                <Points points={points} />
              ) : (
                <p className="text-[0.9375rem] text-text-muted">(no summary)</p>
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
