import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useUpdateTaskStatus } from '../api/tasks'
import { ArrowLeft, BellRing, CalendarDays, Check, Mail, Pencil, Phone, Plus, Sunrise, Tag, Trash2, UserRound } from 'lucide-react'
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
import AiNotice from '../components/AiNotice'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import ConfirmDialog from '../components/ConfirmDialog'
import Disclosure from '../components/Disclosure'
import ImportantDates from '../components/ImportantDates'
import { cadenceSummary } from '../lib/cadence'
import InteractionCard from '../components/InteractionCard'
import FrequencySelect from '../components/FrequencySelect'
import Panel from '../components/Panel'
import { Input, Label, Textarea } from '../components/fields'
import { describeKeepInTouch, keepInTouchStatus } from '../lib/keepInTouch'
import { timeAgo } from '../lib/timeAgo'

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

// One labelled fact in the About panel: icon, label, value.
function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 text-sm">
      <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center text-text-faint">{icon}</span>
      <span className="w-24 flex-shrink-0 text-text-faint">{label}</span>
      <span className="min-w-0 flex-1 break-words text-text">{children}</span>
    </div>
  )
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
  const [pendingNoteDelete, setPendingNoteDelete] = useState<number | null>(null)
  // Follow-ups just ticked off here: hidden at once, before the server answers.
  const [completedTaskIds, setCompletedTaskIds] = useState<number[]>([])
  const updateTaskStatus = useUpdateTaskStatus()
  const queryClient = useQueryClient()

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
  const cadence = cadenceSummary(interactions.map((i) => i.date))
  const otherPeople = (allPeople ?? []).filter((p) => p.id !== id)
  // Open follow-ups from this person's notes, soonest due first (no date last).
  const todayIso = new Date().toISOString().slice(0, 10)
  const openTasks = interactions
    .flatMap((i) => i.tasks ?? [])
    .filter((t) => t.status === 'open' && !completedTaskIds.includes(t.id))
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  // The server returns notes oldest-first; the timeline reads newest-first.
  const timeline = [...interactions].sort(
    (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id,
  )
  const kit = keepInTouchStatus(person)
  const lastTalked = interactions.map((i) => i.date).filter(Boolean).sort().pop()
  const hasDetails = Boolean(person.email || person.phone || person.first_met_date || person.tags.length || person.description)

  function completeTask(taskId: number) {
    setCompletedTaskIds((ids) => [...ids, taskId])
    updateTaskStatus.mutate(
      { taskId, status: 'done' },
      {
        onError: () => setCompletedTaskIds((ids) => ids.filter((x) => x !== taskId)),
        // the notes on this page carry their tasks, so refresh them too
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['people', id] }),
      },
    )
  }

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
    // Dialog stays open (see the ConfirmDialog busy prop below) until
    // this actually resolves - a cascading server-side delete (their
    // interactions, tasks, etc.) isn't instant, and closing the dialog
    // immediately on click left no visible sign anything was happening.
    deletePerson.mutate(id, {
      onSuccess: () => navigate('/people'),
      onError: () => setConfirmDialog(null),
    })
  }

  function handleMerge() {
    if (mergeTargetId === '') return
    mergePerson.mutate(
      { personId: id, targetId: mergeTargetId },
      {
        onSuccess: (res) => navigate(`/people/${res.person_id}`),
        onError: () => setConfirmDialog(null),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate('/people')}
        className="flex h-9 items-center gap-1.5 self-start text-sm text-text-muted transition-colors hover:text-text"
      >
        <ArrowLeft size={14} strokeWidth={1.6} /> Contacts
      </button>

      {!isEditing ? (
        <>
          {/* Header: who this is and what you can do with them. */}
          <Panel bodyClassName="p-4">
            <div className="flex items-start gap-4">
              <Avatar id={person.id} name={person.name} size="lg" />
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold tracking-tight">{person.name}</h1>
                {(person.role || person.company) && (
                  <p className="text-[15px] text-text-muted">
                    {person.role}
                    {person.role && person.company ? ' · ' : ''}
                    {person.company && (
                      <Link
                        to={`/people/company/${encodeURIComponent(person.company)}`}
                        className="hover:text-accent hover:underline"
                      >
                        {person.company}
                      </Link>
                    )}
                  </p>
                )}
                <p className="mt-1 text-xs text-text-faint">
                  {lastTalked ? `Last talked ${timeAgo(lastTalked)}` : 'No notes yet'}
                  {cadence ? ` · ${cadence}` : ''}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => briefing.mutate()} disabled={briefing.isPending}>
                <span className="flex items-center gap-1.5">
                  <Sunrise size={15} strokeWidth={1.6} /> {briefing.isPending ? 'Preparing briefing…' : 'Get briefing'}
                </span>
              </Button>
              <Button onClick={() => setIsEditing(true)}>
                <span className="flex items-center gap-1.5">
                  <Pencil size={14} strokeWidth={1.6} /> Edit info
                </span>
              </Button>
            </div>
          </Panel>

          {briefing.data && (
            <section className="rounded-xl border border-border bg-accent-soft p-4">
              <div className="prose-chat min-w-0 text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.data.briefing}</ReactMarkdown>
              </div>
              <div className="mt-2 border-t border-border pt-2">
                <AiNotice kind="briefing" />
              </div>
            </section>
          )}

          {/* About: the facts, one per row. */}
          <Panel title="About" bodyClassName="divide-y divide-border">
            {person.email && (
              <DetailRow icon={<Mail size={15} strokeWidth={1.6} />} label="Email">
                <a href={`mailto:${person.email}`} className="hover:text-accent hover:underline">
                  {person.email}
                </a>
              </DetailRow>
            )}
            {person.phone && (
              <DetailRow icon={<Phone size={15} strokeWidth={1.6} />} label="Phone">
                <a href={`tel:${person.phone}`} className="hover:text-accent hover:underline">
                  {person.phone}
                </a>
              </DetailRow>
            )}
            {person.first_met_date && (
              <DetailRow icon={<CalendarDays size={15} strokeWidth={1.6} />} label="First met">
                {person.first_met_date}
              </DetailRow>
            )}
            <DetailRow icon={<BellRing size={15} strokeWidth={1.6} />} label="Keep in touch">
              <span className="flex flex-wrap items-center gap-2">
                <FrequencySelect
                  value={person.keep_in_touch_days}
                  disabled={updatePerson.isPending}
                  onChange={(days) =>
                    updatePerson.mutate({ keep_in_touch_days: days, keep_in_touch_snoozed_until: null })
                  }
                />
                {kit && (
                  <span className={`text-xs ${kit.state === 'overdue' ? 'font-medium text-danger' : 'text-text-faint'}`}>
                    {describeKeepInTouch(kit)}
                  </span>
                )}
              </span>
              {updatePerson.isError && (
                <span className="mt-1 block text-xs text-danger">
                  {updatePerson.error instanceof Error && updatePerson.error.message.includes('Keep in touch')
                    ? updatePerson.error.message
                    : "Couldn't save that. Please try again."}
                </span>
              )}
            </DetailRow>
            {person.tags.length > 0 && (
              <DetailRow icon={<Tag size={15} strokeWidth={1.6} />} label="Tags">
                <span className="flex flex-wrap gap-1">
                  {person.tags.map((t) => (
                    <span key={t} className="rounded-full bg-bg-hover px-2 py-0.5 text-xs text-text-muted">
                      {t}
                    </span>
                  ))}
                </span>
              </DetailRow>
            )}
            {person.description && (
              <DetailRow icon={<UserRound size={15} strokeWidth={1.6} />} label="Notes">
                <span className="whitespace-pre-wrap">{person.description}</span>
              </DetailRow>
            )}
            {!hasDetails && (
              <p className="px-4 py-3 text-sm text-text-muted">
                No details yet - they fill in as you log notes, or add them with Edit info.
              </p>
            )}
            <div className="px-4 py-3">
              <ImportantDates person={person} />
            </div>
          </Panel>

          {/* Personal notes: the human details worth remembering. */}
          <Panel title="Personal notes" bodyClassName="px-4 pb-4 pt-1">
            {person.personal_notes.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1.5">
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
                        onClick={() => setPendingNoteDelete(index)}
                        disabled={deletePersonalNote.isPending}
                        className="flex-shrink-0 text-text-faint hover:text-danger"
                        title="Remove this note"
                        aria-label="Remove this note"
                      >
                        <Trash2 size={13} strokeWidth={1.6} />
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
                <Plus size={14} strokeWidth={1.6} />
              </Button>
            </div>
          </Panel>
        </>
      ) : (
        form && (
          <Panel title="Edit info" bodyClassName="p-4">
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
          </Panel>
        )
      )}

      {/* Open follow-ups from their notes - what you still owe, or are waiting on. */}
      {!isEditing && openTasks.length > 0 && (
        <Panel title={`Open follow-ups · ${openTasks.length}`} bodyClassName="divide-y divide-border">
          {openTasks.map((t) => {
            const overdue = Boolean(t.due_date && t.due_date < todayIso)
            return (
              <div key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                {/* A real button: tapping it marks the follow-up done. */}
                <button
                  type="button"
                  onClick={() => completeTask(t.id)}
                  title="Mark as done"
                  aria-label={`Mark done: ${t.description}`}
                  className="group mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border border-border-strong text-transparent transition-colors hover:border-success hover:bg-success hover:text-white focus-visible:border-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/50"
                >
                  <Check size={11} strokeWidth={3} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text">{t.description}</p>
                  <p className={`mt-0.5 text-xs ${overdue ? 'font-medium text-danger' : 'text-text-faint'}`}>
                    {t.due_date ? `${overdue ? 'Overdue · ' : 'Due '}${t.due_date}` : 'No due date'}
                    {' · '}
                    {t.owner === 'them' ? `${person.name.split(' ')[0]} owes you` : 'You owe'}
                  </p>
                </div>
              </div>
            )
          })}
        </Panel>
      )}

      <Panel title={`Timeline${interactions.length ? ` · ${interactions.length}` : ''}`} bodyClassName="divide-y divide-border">
        {interactions.length === 0 && (
          <p className="px-4 py-3 text-sm text-text-muted">No interactions logged with this contact yet.</p>
        )}
        {timeline.map((interaction) => (
          <InteractionCard key={interaction.id} interaction={interaction} flat />
        ))}
      </Panel>

      {/* Only shown when it's actually relevant - a secondary-mention note
          somewhere else (e.g. "Rhea, Priya's sister" showing up in a note
          that's really about Priya). An empty "Mentioned in" section under a
          full timeline is just clutter, so the whole block only renders when
          there's at least one to show. */}
      {mentioned_in.length > 0 && (
        <Panel title={`Mentioned in · ${mentioned_in.length}`} bodyClassName="divide-y divide-border">
          {mentioned_in.map((m, i) => (
            <Disclosure
              key={i}
              flat
              summary={`${m.interaction.date ?? 'unknown date'} — mentioned in ${
                m.interaction.person ? `a note about ${m.interaction.person.name}` : 'a personal note'
              }`}
            >
              {m.relation && <p className="text-xs text-text-muted">Relation: {m.relation}</p>}
              {m.interaction.summary && <p className="mt-1 text-sm">{m.interaction.summary}</p>}
            </Disclosure>
          ))}
        </Panel>
      )}

      <Disclosure summary="Merge or delete this contact">
        <div className="flex flex-col gap-3">
          {otherPeople.length > 0 ? (
            <div>
              <Label>Merge this contact into…</Label>
              <div className="flex gap-2">
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value ? Number(e.target.value) : '')}
                  className="flex-1 rounded-lg border border-border-strong bg-bg-card px-3 py-2 text-sm"
                >
                  <option value="">Select a contact…</option>
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
            <p className="text-sm text-text-muted">No other contacts to merge into yet.</p>
          )}
          <Button variant="danger" onClick={() => setConfirmDialog('delete')} className="self-start">
            Delete this contact
          </Button>
        </div>
      </Disclosure>

      {confirmDialog === 'merge' && (
        <ConfirmDialog
          title="Confirm merge"
          message={`Merge ${person.name} into the selected contact? All of their interactions and follow-ups will be reassigned, and this contact will be removed. This cannot be undone.`}
          confirmLabel="Merge"
          busy={mergePerson.isPending}
          busyLabel="Merging…"
          onConfirm={handleMerge}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      {confirmDialog === 'delete' && (
        <ConfirmDialog
          title="Confirm delete"
          message={`Delete ${person.name}? This also deletes all of their interactions and follow-up tasks. This cannot be undone.`}
          confirmLabel="Delete"
          busy={deletePerson.isPending}
          busyLabel="Deleting…"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      {pendingNoteDelete !== null && (
        <ConfirmDialog
          title="Remove this note?"
          message="This personal note entry will be permanently removed. This cannot be undone."
          confirmLabel="Remove"
          busy={deletePersonalNote.isPending}
          busyLabel="Removing…"
          onConfirm={() => {
            deletePersonalNote.mutate(pendingNoteDelete, { onSettled: () => setPendingNoteDelete(null) })
          }}
          onCancel={() => setPendingNoteDelete(null)}
        />
      )}
    </div>
  )
}
