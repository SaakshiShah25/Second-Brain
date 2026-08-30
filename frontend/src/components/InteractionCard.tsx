import { useState, type FormEvent } from 'react'
import { CheckCircle2, MapPin, Tag, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useInitiatives } from '../api/initiatives'
import { useDeleteInteraction, useUpdateInteraction } from '../api/people'
import type { Interaction } from '../api/types'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import Disclosure from './Disclosure'
import { Input, Label, Textarea } from './fields'

const MEETING_TYPES = [
  '',
  'discovery',
  'demo',
  'negotiation',
  'check-in',
  'networking',
  'contract',
  'support',
  'internal',
  'other',
]

const selectClass =
  'w-full rounded-lg border border-border-strong bg-bg-card px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

// Collapsed by default (just the date/summary line, via Disclosure) -
// owns its own edit-mode toggle locally now, so PersonDetailPage doesn't
// need to track which interaction (if any) is being edited.
export default function InteractionCard({ interaction }: { interaction: Interaction }) {
  const updateInteraction = useUpdateInteraction()
  const deleteInteraction = useDeleteInteraction()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Only fetched lazily when actually needed (the Notes page's edit
  // form) - react-query dedupes this against NotesPage's own
  // useInitiatives() call, so it's not a duplicate network request.
  const { data: initiatives } = useInitiatives()

  // `interaction.person`/`interaction.initiative` are only ever present
  // when this card is rendered from the Notes page (GET /api/notes'
  // joined select) - PersonDetailPage's own interaction list doesn't
  // include them, so this header simply doesn't render there.
  const showNoteContext = interaction.person !== undefined

  const [form, setForm] = useState({
    date: interaction.date ?? '',
    location: interaction.location ?? '',
    appearance: interaction.appearance ?? '',
    summary: interaction.summary ?? '',
    raw_text: interaction.raw_text ?? '',
    meeting_type: interaction.meeting_type ?? '',
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

  return (
    <Disclosure summary={`${interaction.date ?? 'unknown date'} — ${interaction.summary || '(no summary)'}`}>
      {showNoteContext && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          {interaction.person ? (
            <Link to={`/people/${interaction.person.id}`} className="font-medium text-accent hover:underline">
              {interaction.person.name}
            </Link>
          ) : (
            <span className="rounded-full border border-border-strong px-2 py-0.5 text-text-muted">
              Standalone note
            </span>
          )}
          {interaction.initiative ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">{interaction.initiative.name}</span>
          ) : (
            <span className="rounded-full border border-border-strong px-2 py-0.5 text-text-faint">
              Uncategorized
            </span>
          )}
        </div>
      )}
      {!editing ? (
        <>
          {interaction.meeting_type && (
            <p className="mb-1 flex items-center gap-1 text-xs text-text-muted">
              <Tag size={12} strokeWidth={1.6} className="flex-shrink-0" />
              {interaction.meeting_type}
            </p>
          )}
          {interaction.location && <p className="text-xs text-text-muted">Location: {interaction.location}</p>}
          {interaction.appearance && (
            <p className="text-xs text-text-muted">Appearance that day: {interaction.appearance}</p>
          )}
          {interaction.maps_url && (
            <p className="flex items-center gap-1 text-xs text-text-muted">
              <MapPin size={12} strokeWidth={1.6} className="flex-shrink-0" />
              {interaction.geo_address ?? `${interaction.geo_lat?.toFixed(5)}, ${interaction.geo_lng?.toFixed(5)}`}
              {' · '}
              <a href={interaction.maps_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                view on map
              </a>
            </p>
          )}
          {interaction.decisions && interaction.decisions.length > 0 && (
            <div className="mt-2">
              <p className="flex items-center gap-1 text-xs font-medium">
                <CheckCircle2 size={12} strokeWidth={1.6} /> Decisions:
              </p>
              {interaction.decisions.map((d, i) => (
                <p key={i} className="text-xs text-text-muted">
                  - {d}
                </p>
              ))}
            </div>
          )}
          {interaction.concerns && interaction.concerns.length > 0 && (
            <div className="mt-2">
              <p className="flex items-center gap-1 text-xs font-medium">
                <TriangleAlert size={12} strokeWidth={1.6} /> Concerns:
              </p>
              {interaction.concerns.map((c, i) => (
                <p key={i} className="text-xs text-text-muted">
                  - {c}
                </p>
              ))}
            </div>
          )}
          {interaction.tasks && interaction.tasks.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium">Follow-ups:</p>
              {interaction.tasks.map((t) => (
                <p key={t.id} className="text-xs text-text-muted">
                  - {t.description} [{t.status}
                  {t.due_date ? `, due ${t.due_date}` : ''}] — {t.owner === 'them' ? 'Them' : 'Me'}
                </p>
              ))}
            </div>
          )}
          {interaction.raw_text && (
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-bg-elevated p-2 text-xs text-text-muted">
              {interaction.raw_text}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete interaction
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={handleSave} className="flex flex-col gap-2">
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <Label>Meeting type</Label>
            <select
              className={selectClass}
              value={form.meeting_type}
              onChange={(e) => setForm({ ...form, meeting_type: e.target.value })}
            >
              {MEETING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t || '(none)'}
                </option>
              ))}
            </select>
          </div>
          {showNoteContext && (
            <div>
              <Label>Initiative</Label>
              <select
                className={selectClass}
                value={form.initiative_id ?? ''}
                onChange={(e) => setForm({ ...form, initiative_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Uncategorized</option>
                {initiatives?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
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
            <Label>Summary</Label>
            <Textarea rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
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
            <Label>Raw text</Label>
            <Textarea rows={4} value={form.raw_text} onChange={(e) => setForm({ ...form, raw_text: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={updateInteraction.isPending}>
              {updateInteraction.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Confirm delete"
          message="Delete this interaction and its follow-up tasks? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => {
            setConfirmDelete(false)
            deleteInteraction.mutate(interaction.id)
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Disclosure>
  )
}
