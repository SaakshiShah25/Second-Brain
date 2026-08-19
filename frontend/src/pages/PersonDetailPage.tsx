import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Sunrise, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  useAddPersonalNote,
  useBriefing,
  useDeletePerson,
  useDeletePersonalNote,
  useMergePerson,
  usePeople,
  usePerson,
  useUpdatePerson,
} from '../api/people'
import Avatar from '../components/Avatar'
import Card from '../components/Card'
import Button from '../components/Button'
import ConfirmDialog from '../components/ConfirmDialog'
import Disclosure from '../components/Disclosure'
import InteractionCard from '../components/InteractionCard'
import SpeakButton from '../components/SpeakButton'
import { Input, Label, Textarea } from '../components/fields'

interface PersonForm {
  name: string
  description: string
  role: string
  company: string
  phone: string
  email: string
  tags: string
  first_met_date: string
}

export default function PersonDetailPage() {
  const { personId } = useParams<{ personId: string }>()
  const id = Number(personId)
  const navigate = useNavigate()

  const { data, isLoading, error } = usePerson(id)
  const { data: allPeople } = usePeople()
  const updatePerson = useUpdatePerson(id)
  const deletePerson = useDeletePerson()
  const mergePerson = useMergePerson()
  const briefing = useBriefing(id)
  const addPersonalNote = useAddPersonalNote(id)
  const deletePersonalNote = useDeletePersonalNote(id)

  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<PersonForm | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<number | ''>('')
  const [confirmDialog, setConfirmDialog] = useState<'merge' | 'delete' | null>(null)
  const [newNoteText, setNewNoteText] = useState('')

  useEffect(() => {
    if (data?.person) {
      const p = data.person
      setForm({
        name: p.name,
        description: p.description,
        role: p.role,
        company: p.company,
        phone: p.phone,
        email: p.email,
        tags: p.tags.join(', '),
        first_met_date: p.first_met_date ?? '',
      })
    }
  }, [data?.person])

  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>
  if (error || !data) return <p className="text-sm text-danger">Couldn't load this person.</p>

  const { person, interactions, mentioned_in } = data
  const otherPeople = (allPeople ?? []).filter((p) => p.id !== id)
  const roleCompany = [person.role, person.company].filter(Boolean).join(', ')

  function handleAddNote() {
    if (!newNoteText.trim()) return
    addPersonalNote.mutate(newNoteText.trim(), { onSuccess: () => setNewNoteText('') })
  }

  function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    updatePerson.mutate(
      {
        name: form.name,
        description: form.description,
        role: form.role,
        company: form.company,
        phone: form.phone,
        email: form.email,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        first_met_date: form.first_met_date || null,
      },
      { onSuccess: () => setIsEditing(false) },
    )
  }

  function handleDelete() {
    deletePerson.mutate(id, { onSuccess: () => navigate('/people') })
  }

  function handleMerge() {
    if (mergeTargetId === '') return
    mergePerson.mutate(
      { personId: id, targetId: mergeTargetId },
      { onSuccess: (res) => navigate(`/people/${res.person_id}`) },
    )
  }

  return (
    <div>
      <Button onClick={() => navigate('/people')} className="mb-4">
        <span className="flex items-center gap-1.5">
          <ArrowLeft size={14} strokeWidth={2} /> Back to People
        </span>
      </Button>

      {!isEditing ? (
        <div className="mb-4 flex items-start gap-4">
          <Avatar id={person.id} name={person.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{person.name}</h1>
            {roleCompany && <p className="text-sm text-text-muted">{roleCompany}</p>}
            {person.description && <p className="mt-2 whitespace-pre-wrap text-sm text-text">{person.description}</p>}
            <div className="mt-2">
              <p className="mb-1 text-xs font-medium text-text-muted">Personal notes</p>
              {person.personal_notes.length > 0 && (
                <ul className="mb-2 flex flex-col gap-1">
                  {person.personal_notes
                    .map((entry, index) => ({ entry, index }))
                    .slice()
                    .reverse()
                    .map(({ entry, index }) => (
                      <li key={index} className="flex items-start justify-between gap-2 text-sm text-text">
                        <span className="min-w-0">
                          <span className="text-text-faint">{entry.date} — </span>
                          {entry.note}
                        </span>
                        <button
                          type="button"
                          onClick={() => deletePersonalNote.mutate(index)}
                          disabled={deletePersonalNote.isPending}
                          className="flex-shrink-0 text-text-faint hover:text-danger"
                          title="Remove this note"
                        >
                          <Trash2 size={13} strokeWidth={2} />
                        </button>
                      </li>
                    ))}
                </ul>
              )}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Add a personal note (e.g. likes trekking, moved to Pune)"
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddNote()
                    }
                  }}
                  className="flex-1 text-sm"
                />
                <Button
                  type="button"
                  onClick={handleAddNote}
                  disabled={addPersonalNote.isPending || !newNoteText.trim()}
                  title="Add note"
                >
                  <Plus size={14} strokeWidth={2} />
                </Button>
              </div>
            </div>
            {person.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {person.tags.map((t) => (
                  <span key={t} className="rounded-full bg-bg-card px-2 py-0.5 text-xs text-text-muted">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-faint">
              {person.first_met_date && <span>First met {person.first_met_date}</span>}
              {person.phone && <span>{person.phone}</span>}
              {person.email && <span>{person.email}</span>}
            </div>
          </div>
        </div>
      ) : (
        form && (
          <Card className="mb-4">
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Description (general/stable traits)</Label>
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Role</Label>
                  <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
                </div>
                <div>
                  <Label>Company</Label>
                  <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Tags (comma-separated)</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
              <div>
                <Label>First met</Label>
                <Input
                  type="date"
                  value={form.first_met_date}
                  onChange={(e) => setForm({ ...form, first_met_date: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" disabled={updatePerson.isPending}>
                  {updatePerson.isPending ? 'Saving…' : 'Save changes'}
                </Button>
                <Button type="button" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )
      )}

      <div className="mb-6 flex gap-2">
        <Button variant="primary" onClick={() => briefing.mutate()} disabled={briefing.isPending}>
          <span className="flex items-center gap-1.5">
            <Sunrise size={15} strokeWidth={2} /> {briefing.isPending ? 'Preparing briefing…' : 'Get briefing'}
          </span>
        </Button>
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)}>
            <span className="flex items-center gap-1.5">
              <Pencil size={14} strokeWidth={2} /> Edit info
            </span>
          </Button>
        )}
      </div>
      {briefing.data && (
        <Card className="mb-6 flex items-start justify-between gap-2 bg-accent-soft">
          <div className="prose-chat min-w-0 flex-1 text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.data.briefing}</ReactMarkdown>
          </div>
          <SpeakButton text={briefing.data.briefing} />
        </Card>
      )}

      <h2 className="mb-3 text-lg font-semibold">Interaction timeline</h2>
      {interactions.length === 0 && (
        <p className="mb-6 text-sm text-text-muted">No interactions logged with this person yet.</p>
      )}
      <div className="mb-6 flex flex-col gap-2">
        {interactions.map((interaction) => (
          <InteractionCard key={interaction.id} interaction={interaction} />
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Mentioned in</h2>
      {mentioned_in.length === 0 && (
        <p className="mb-6 text-sm text-text-muted">Not mentioned as a secondary person in any other notes yet.</p>
      )}
      <div className="mb-6 flex flex-col gap-2">
        {mentioned_in.map((m, i) => (
          <Disclosure
            key={i}
            summary={`${m.interaction.date ?? 'unknown date'} — mentioned in a note about ${m.interaction.person.name}`}
          >
            {m.relation && <p className="text-xs text-text-muted">Relation: {m.relation}</p>}
            {m.interaction.summary && <p className="mt-1 text-sm">{m.interaction.summary}</p>}
          </Disclosure>
        ))}
      </div>

      <Disclosure summary="Merge or delete this person">
        <div className="flex flex-col gap-3">
          {otherPeople.length > 0 ? (
            <div>
              <Label>Merge this person into…</Label>
              <div className="flex gap-2">
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value ? Number(e.target.value) : '')}
                  className="flex-1 rounded-lg border border-border-strong bg-bg-card px-3 py-2 text-sm"
                >
                  <option value="">Select a person…</option>
                  {otherPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.role ? ` — ${p.role}` : ''} (id {p.id})
                    </option>
                  ))}
                </select>
                <Button onClick={() => setConfirmDialog('merge')} disabled={mergeTargetId === ''}>
                  Merge
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">No other people to merge into yet.</p>
          )}
          <Button variant="danger" onClick={() => setConfirmDialog('delete')} className="self-start">
            Delete this person
          </Button>
        </div>
      </Disclosure>

      {confirmDialog === 'merge' && (
        <ConfirmDialog
          title="Confirm merge"
          message={`Merge ${person.name} into the selected person? All of their interactions and follow-ups will be reassigned, and this person record will be removed. This cannot be undone.`}
          confirmLabel="Merge"
          onConfirm={() => {
            setConfirmDialog(null)
            handleMerge()
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      {confirmDialog === 'delete' && (
        <ConfirmDialog
          title="Confirm delete"
          message={`Delete ${person.name}? This also deletes all of their interactions and follow-up tasks. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            setConfirmDialog(null)
            handleDelete()
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  )
}
