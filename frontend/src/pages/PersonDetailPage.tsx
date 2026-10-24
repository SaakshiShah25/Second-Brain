import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GitMerge, Mail, NotebookPen, Phone, Plus, Sparkles, Trash2, X } from 'lucide-react'
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
import Button from '../components/Button'
import ConfirmDialog from '../components/ConfirmDialog'
import InteractionCard from '../components/InteractionCard'
import { Input, Label, Select, Textarea } from '../components/fields'
import { ListGroup, ListRow } from '../components/ListGroup'
import PageHeader from '../components/PageHeader'
import Sheet from '../components/Sheet'
import { friendlyDate } from '../lib/dates'
import { useUsageMode } from '../lib/usageMode'

function QuickAction({
  icon: Icon,
  label,
  href,
  onClick,
  disabled,
}: {
  icon: typeof Phone
  label: string
  href?: string
  onClick?: () => void
  disabled?: boolean
}) {
  const inner = (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon size={20} strokeWidth={2} />
      </span>
      <span className="text-xs font-medium text-text-muted">{label}</span>
    </>
  )
  const cls = `pressable flex flex-1 flex-col items-center gap-1.5 ${disabled ? 'pointer-events-none opacity-35' : ''}`
  return href && !disabled ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  )
}

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
  const [mergeOpen, setMergeOpen] = useState(false)
  const noteInputRef = useRef<HTMLInputElement>(null)
  const usage = useUsageMode()
  const [newNoteText, setNewNoteText] = useState('')
  const [pendingNoteDelete, setPendingNoteDelete] = useState<number | null>(null)

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

  if (isLoading)
    return (
      <>
        <PageHeader backTo="/people" backLabel="People" />
        <p className="text-sm text-text-muted">Loading…</p>
      </>
    )
  if (error || !data)
    return (
      <>
        <PageHeader backTo="/people" backLabel="People" />
        <p className="text-sm text-danger">Couldn't load this person.</p>
      </>
    )

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
    // Dialog stays open (see the ConfirmDialog busy prop below) until
    // this actually resolves - a cascading server-side delete (their
    // interactions, tasks, etc.) isn't instant, and closing the dialog
    // immediately on click left no visible sign anything was happening.
    deletePerson.mutate(id, {
      onSuccess: () => navigate('/people', { replace: true }),
      onError: () => setConfirmDialog(null),
    })
  }

  function handleMerge() {
    if (mergeTargetId === '') return
    mergePerson.mutate(
      { personId: id, targetId: mergeTargetId },
      {
        onSuccess: (res) => {
          setConfirmDialog(null)
          setMergeOpen(false)
          navigate(`/people/${res.person_id}`, { replace: true })
        },
        onError: () => setConfirmDialog(null),
      },
    )
  }

  // Role/company lead the edit form for work use; in Personal mode they
  // move to an optional section at the end rather than disappearing.
  const workFields = form && (
    <>
          <div>
            <Label>Role</Label>
            <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          </div>
          <div>
            <Label>Company</Label>
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
    </>
  )

  return (
    <div>
      <PageHeader
        backTo="/people"
        backLabel="People"
        actions={
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="pressable h-11 px-1 text-[0.9375rem] font-medium text-link"
          >
            Edit
          </button>
        }
      />

      <div className="mb-6 flex flex-col items-center text-center">
        <Avatar id={person.id} name={person.name} size="lg" />
        <h1 className="mt-3 font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.03em]">{person.name}</h1>
        {roleCompany && <p className="mt-0.5 text-[0.9375rem] text-text-muted">{roleCompany}</p>}
      </div>

      <div className="mb-6 flex justify-between px-2">
        <QuickAction icon={Phone} label="Call" href={person.phone ? `tel:${person.phone}` : undefined} disabled={!person.phone} />
        <QuickAction icon={Mail} label="Email" href={person.email ? `mailto:${person.email}` : undefined} disabled={!person.email} />
        <QuickAction
          icon={Sparkles}
          label={briefing.isPending ? 'Preparing…' : 'Briefing'}
          onClick={() => briefing.mutate()}
          disabled={briefing.isPending}
        />
        <QuickAction icon={NotebookPen} label="Note" onClick={() => noteInputRef.current?.focus()} />
      </div>

      {briefing.data && (
        <section className="relative mb-6 rounded-2xl border border-brand/30 bg-brand-soft p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[0.8125rem] font-semibold uppercase tracking-wide text-brand-ink">
            <Sparkles size={14} strokeWidth={2} /> Briefing
          </p>
          <button
            type="button"
            onClick={() => briefing.reset()}
            aria-label="Dismiss briefing"
            className="pressable absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full text-text-muted"
          >
            <X size={16} strokeWidth={2} />
          </button>
          <div className="prose-chat text-[0.9375rem] leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.data.briefing}</ReactMarkdown>
          </div>
        </section>
      )}

      {(person.description || person.tags.length > 0 || person.first_met_date || person.phone || person.email) && (
        <section className="mb-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
          {person.description && (
            <div className="px-4 py-3">
              <p className="mb-0.5 text-[0.8125rem] text-text-muted">About</p>
              <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">{person.description}</p>
            </div>
          )}
          {person.phone && (
            <a href={`tel:${person.phone}`} className="pressable block px-4 py-3">
              <p className="mb-0.5 text-[0.8125rem] text-text-muted">Phone</p>
              <p className="text-[0.9375rem] text-link">{person.phone}</p>
            </a>
          )}
          {person.email && (
            <a href={`mailto:${person.email}`} className="pressable block px-4 py-3">
              <p className="mb-0.5 text-[0.8125rem] text-text-muted">Email</p>
              <p className="truncate text-[0.9375rem] text-link">{person.email}</p>
            </a>
          )}
          {person.first_met_date && (
            <div className="px-4 py-3">
              <p className="mb-0.5 text-[0.8125rem] text-text-muted">First met</p>
              <p className="text-[0.9375rem]">{friendlyDate(person.first_met_date)}</p>
            </div>
          )}
          {person.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 py-3">
              {person.tags.map((t) => (
                <span key={t} className="rounded-full bg-bg-elevated px-2.5 py-1 text-[0.8125rem] text-text-muted">
                  {t}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <h2 className="mb-2 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint">Personal notes</h2>
      <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-bg-card">
        {person.personal_notes.length > 0 && (
          <ul className="divide-y divide-border">
            {person.personal_notes
              .map((entry, index) => ({ entry, index }))
              .slice()
              .reverse()
              .map(({ entry, index }) => (
                <li key={index} className="flex items-start gap-2 py-2.5 pr-1.5 pl-4">
                  <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug">
                    {entry.note}
                    <span className="mt-0.5 block text-[0.8125rem] text-text-faint">{friendlyDate(entry.date)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingNoteDelete(index)}
                    disabled={deletePersonalNote.isPending}
                    aria-label="Remove this note"
                    className="pressable flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-text-faint"
                  >
                    <Trash2 size={16} strokeWidth={1.8} />
                  </button>
                </li>
              ))}
          </ul>
        )}
        <div className={`flex items-center gap-2 p-2 pl-4 ${person.personal_notes.length > 0 ? 'border-t border-border' : ''}`}>
          <input
            ref={noteInputRef}
            placeholder="Add a detail — likes trekking, moved to Pune…"
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddNote()
              }
            }}
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-text placeholder:text-text-faint focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddNote}
            disabled={addPersonalNote.isPending || !newNoteText.trim()}
            aria-label="Add note"
            className="pressable flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast disabled:opacity-30"
          >
            <Plus size={20} strokeWidth={2.2} />
          </button>
        </div>
      </section>

      <h2 className="mb-3 font-display text-[1.375rem] font-semibold tracking-[-0.025em]">Timeline</h2>
      {interactions.length === 0 && (
        <p className="mb-6 text-[0.9375rem] text-text-muted">No conversations logged with {person.name} yet.</p>
      )}
      <div className="mb-6 flex flex-col gap-2.5">
        {interactions.map((interaction) => (
          <InteractionCard key={interaction.id} interaction={interaction} />
        ))}
      </div>

      {/* Only when relevant - a secondary mention in someone else's note
          (e.g. "Rhea, Priya's sister" in a note about Priya). */}
      {mentioned_in.length > 0 && (
        <>
          <h2 className="mb-2 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint">Mentioned in</h2>
          <div className="mb-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
            {mentioned_in.map((m, i) => (
              <div key={i} className="px-4 py-3">
                <p className="text-[0.8125rem] text-text-muted">
                  {friendlyDate(m.interaction.date)} ·{' '}
                  {m.interaction.person ? `a note about ${m.interaction.person.name}` : 'a personal note'}
                  {m.relation && ` · ${m.relation}`}
                </p>
                {m.interaction.summary && <p className="mt-0.5 text-[0.9375rem] leading-snug">{m.interaction.summary}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-8">
        <ListGroup>
          <ListRow
            icon={GitMerge}
            iconColor="#78716c"
            label="Merge with another person"
            chevron
            onClick={() => setMergeOpen(true)}
          />
          <ListRow
            icon={Trash2}
            iconColor="#e5383b"
            label={`Delete ${person.name}`}
            danger
            onClick={() => setConfirmDialog('delete')}
          />
        </ListGroup>
      </div>

      {isEditing && form && (
        <Sheet onClose={updatePerson.isPending ? undefined : () => setIsEditing(false)} title="Edit contact" tall>
          <form onSubmit={handleSave} className="flex flex-col gap-3.5">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {usage.isWork && workFields}
            <div>
              <Label>Phone</Label>
              <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>About (general, stable traits)</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
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
            {!usage.isWork && (
              <>
                <p className="mt-2 -mb-1.5 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint">
                  Work details (optional)
                </p>
                {workFields}
              </>
            )}
            <div className="mt-1 flex gap-2">
              <Button type="button" className="flex-1" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="flex-1" disabled={updatePerson.isPending}>
                {updatePerson.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </Sheet>
      )}

      {mergeOpen && (
        <Sheet onClose={() => setMergeOpen(false)} title={`Merge ${person.name}`}>
          {otherPeople.length > 0 ? (
            <>
              <p className="mb-4 text-[0.9375rem] leading-relaxed text-text-muted">
                Duplicate contact? Move all of {person.name}'s notes and follow-ups onto someone else, then remove this
                entry.
              </p>
              <Label>Merge into</Label>
              <Select
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Select a person…</option>
                {otherPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.role ? ` — ${p.role}` : ''}
                  </option>
                ))}
              </Select>
              <Button
                variant="primary"
                size="lg"
                block
                className="mt-4"
                onClick={() => setConfirmDialog('merge')}
                disabled={mergeTargetId === ''}
              >
                Merge
              </Button>
            </>
          ) : (
            <p className="text-[0.9375rem] text-text-muted">There's no one else to merge into yet.</p>
          )}
        </Sheet>
      )}

      {confirmDialog === 'merge' && (
        <ConfirmDialog
          title="Confirm merge"
          message={`Merge ${person.name} into the selected person? All of their notes and follow-ups will be reassigned, and this contact will be removed. This cannot be undone.`}
          confirmLabel="Merge"
          busy={mergePerson.isPending}
          busyLabel="Merging…"
          onConfirm={handleMerge}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      {confirmDialog === 'delete' && (
        <ConfirmDialog
          title={`Delete ${person.name}?`}
          message="This also deletes all of their notes and follow-up tasks. This cannot be undone."
          confirmLabel="Delete"
          busy={deletePerson.isPending}
          busyLabel="Deleting…"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      {pendingNoteDelete !== null && (
        <ConfirmDialog
          title="Remove this detail?"
          message="This personal note will be permanently removed."
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
