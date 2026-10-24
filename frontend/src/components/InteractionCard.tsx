import { useState, type FormEvent } from 'react'
import { CheckCircle2, ListChecks, MapPin, Pencil, Trash2, TriangleAlert, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useInitiatives } from '../api/initiatives'
import { useDeleteInteraction, useUpdateInteraction } from '../api/people'
import type { Interaction } from '../api/types'
import { friendlyDate } from '../lib/dates'
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
          <li key={i} className="flex gap-2 text-[0.9375rem] leading-relaxed">
            <span className="mt-[0.6rem] h-1 w-1 flex-shrink-0 rounded-full bg-text-faint" />
            {d}
          </li>
        ))}
      </ul>
    </div>
  )
}

// A note as a preview card (category + date, a 3-line summary, who it's
// about) - tapping opens the whole note in a bottom sheet, where Edit and
// Delete live. Replaces the old collapsed one-line disclosure row, which
// showed so little that every note looked the same until expanded.
export default function InteractionCard({ interaction }: { interaction: Interaction }) {
  const updateInteraction = useUpdateInteraction()
  const deleteInteraction = useDeleteInteraction()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // react-query dedupes this against NotesPage's own useInitiatives()
  // call, so it's not a duplicate network request.
  const { data: initiatives } = useInitiatives()

  // `interaction.person`/`interaction.initiative` are only present when
  // rendered from the Notes page (GET /api/notes' joined select) -
  // PersonDetailPage's own list doesn't include them, so the person /
  // category context simply doesn't render there.
  const showNoteContext = interaction.person !== undefined
  const initiativeStyle = showNoteContext ? getInitiativeStyle(interaction.initiative) : null

  const [form, setForm] = useState({
    date: interaction.date ?? '',
    location: interaction.location ?? '',
    appearance: interaction.appearance ?? '',
    summary: interaction.summary ?? '',
    raw_text: interaction.raw_text ?? '',
    decisions: (interaction.decisions ?? []).join('\n'),
    concerns: (interaction.concerns ?? []).join('\n'),
    initiative_id: interaction.initiative_id,
  })

  function handleSave(e: FormEvent) {
    e.preventDefault()
    updateInteraction.mutate(
      {
        interactionId: interaction.id,
        fields: {
          ...form,
          date: form.date || null,
          decisions: form.decisions.split('\n').map((s) => s.trim()).filter(Boolean),
          concerns: form.concerns.split('\n').map((s) => s.trim()).filter(Boolean),
        },
      },
      { onSuccess: () => setEditing(false) },
    )
  }

  function close() {
    setOpen(false)
    setEditing(false)
  }

  const openTasks = (interaction.tasks ?? []).filter((t) => t.status === 'open').length

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable block w-full rounded-2xl border border-border bg-bg-card p-4 text-left"
      >
        <div className="mb-1.5 flex items-center gap-2 text-[0.8125rem]">
          {initiativeStyle && interaction.initiative ? (
            <span className="flex min-w-0 items-center gap-1 font-medium" style={{ color: initiativeStyle.color }}>
              <initiativeStyle.Icon size={13} strokeWidth={2.2} className="flex-shrink-0" />
              <span className="truncate">{interaction.initiative.name}</span>
            </span>
          ) : showNoteContext ? (
            <span className="font-medium text-text-faint">Others</span>
          ) : null}
          {showNoteContext && <span className="text-text-faint">·</span>}
          <span className="flex-shrink-0 text-text-faint">{friendlyDate(interaction.date)}</span>
          {openTasks > 0 && (
            <span className="ml-auto flex flex-shrink-0 items-center gap-1 rounded-full bg-bg-elevated px-2 py-0.5 text-xs font-medium text-text-muted">
              <ListChecks size={12} strokeWidth={2} /> {openTasks}
            </span>
          )}
        </div>
        <p className="line-clamp-3 text-[0.9375rem] leading-snug text-text">
          {interaction.summary || interaction.raw_text || '(no summary)'}
        </p>
        {showNoteContext && (
          <p className="mt-2 flex items-center gap-1.5 text-[0.8125rem] text-text-muted">
            <User size={13} strokeWidth={2} />
            {interaction.person ? interaction.person.name : 'Personal'}
          </p>
        )}
      </button>

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

              <p className="font-display text-[1.375rem] leading-snug font-semibold tracking-[-0.025em]">
                {interaction.summary || '(no summary)'}
              </p>

              {showNoteContext && (
                <div className="mt-3">
                  {interaction.person ? (
                    <Link
                      to={`/people/${interaction.person.id}`}
                      onClick={close}
                      className="inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-link"
                    >
                      <User size={15} strokeWidth={2} /> {interaction.person.name}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[0.9375rem] text-text-muted">
                      <User size={15} strokeWidth={2} /> Personal note
                    </span>
                  )}
                </div>
              )}

              {(interaction.location || interaction.maps_url || interaction.appearance) && (
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
                  {interaction.appearance && <p>Appearance: {interaction.appearance}</p>}
                </div>
              )}

              <Section icon={CheckCircle2} title="Decisions" items={interaction.decisions ?? []} />
              <Section icon={TriangleAlert} title="Concerns" items={interaction.concerns ?? []} />
              {interaction.tasks && interaction.tasks.length > 0 && (
                <div className="mt-5">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint">
                    <ListChecks size={14} strokeWidth={2} /> Follow-ups
                  </p>
                  <ul className="flex flex-col gap-2">
                    {interaction.tasks.map((t) => (
                      <li key={t.id} className="flex items-start gap-2.5 text-[0.9375rem]">
                        <span
                          className={`mt-1 h-4 w-4 flex-shrink-0 rounded-full border-2 ${
                            t.status === 'done' ? 'border-success bg-success' : 'border-text-faint'
                          }`}
                        />
                        <span className={t.status === 'done' ? 'text-text-faint line-through' : ''}>
                          {t.description}
                          <span className="block text-[0.8125rem] text-text-muted">
                            {t.owner === 'them' ? 'They owe this' : 'You owe this'}
                            {t.due_date ? ` · due ${friendlyDate(t.due_date)}` : ''}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {interaction.raw_text && (
                <div className="mt-5">
                  <p className="mb-1.5 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint">
                    What you said
                  </p>
                  <p className="whitespace-pre-wrap rounded-xl bg-bg-elevated p-3.5 text-[0.9375rem] leading-relaxed text-text-muted">
                    {interaction.raw_text}
                  </p>
                </div>
              )}

              <div className="mt-6 flex gap-2">
                <Button className="flex-1" onClick={() => setEditing(true)}>
                  <Pencil size={16} strokeWidth={2} /> Edit
                </Button>
                {/* "Delete", not "Delete interaction" - this card renders
                    every kind of note, including standalone ones with no
                    person involved at all. */}
                <Button variant="danger" className="flex-1" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={16} strokeWidth={2} /> Delete
                </Button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col gap-3.5">
              <h3 className="text-lg font-semibold tracking-tight">Edit note</h3>
              <div>
                <Label>Summary</Label>
                <Textarea rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              {showNoteContext && (
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
              )}
              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <Label>Appearance that day</Label>
                <Textarea rows={2} value={form.appearance} onChange={(e) => setForm({ ...form, appearance: e.target.value })} />
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
          message="This also deletes its follow-up tasks. This cannot be undone."
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
