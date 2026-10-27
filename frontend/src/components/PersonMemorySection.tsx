import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarHeart, Loader2, Plus, X } from 'lucide-react'
import { useAddKeyDate, useAddPersonFact, useDeleteKeyDate, useDeletePersonFact } from '../api/people'
import type { KeyDate, PersonFact, PersonMemory } from '../api/types'
import { Input, Select } from './fields'
import { toast } from './Toast'

// What the app remembers about a person, as structured rows (schema.sql
// section 31): yearly dates, details (likes, hobbies, where they live...) and
// family links. Everything here can be added by hand; the same rows are also
// filled automatically from the notes you log.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const ATTRIBUTES: { value: string; label: string }[] = [
  { value: 'likes', label: 'Likes' },
  { value: 'dislikes', label: 'Dislikes' },
  { value: 'hobby', label: 'Hobby' },
  { value: 'diet', label: 'Diet' },
  { value: 'allergy', label: 'Allergy' },
  { value: 'lives_in', label: 'Lives in' },
  { value: 'hometown', label: 'Hometown' },
  { value: 'education', label: 'Education' },
  { value: 'language', label: 'Language' },
  { value: 'pet', label: 'Pet' },
  { value: 'goal', label: 'Goal' },
  { value: 'life_event', label: 'Life event' },
  { value: 'health', label: 'Health' },
  { value: 'other', label: 'Other' },
]

const SUBJECTS = [
  { value: 'self', label: 'Them' },
  { value: 'spouse', label: 'Their spouse' },
  { value: 'child', label: 'Their child' },
  { value: 'parent', label: 'Their parent' },
  { value: 'sibling', label: 'Their sibling' },
]

function attributeLabel(attribute: string): string {
  return ATTRIBUTES.find((a) => a.value === attribute)?.label ?? attribute.replace(/_/g, ' ')
}

function subjectPrefix(subject: string, name: string | null): string {
  if (subject === 'self') return ''
  const who = SUBJECTS.find((s) => s.value === subject)?.label.replace('Their ', '') ?? subject
  return name ? `${name} (${who}) · ` : `${who} · `
}

const rowClass = 'flex items-start gap-2 py-2.5 pr-1.5 pl-4'
const removeClass =
  'pressable flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-text-faint active:bg-bg-elevated disabled:cursor-wait'

// The ✕ on a row: it must visibly react. The row dims and says "Removing…" while
// the request is out (it can take a second), then a short "Removed" confirms it.
function RemoveButton({ busy, label, onClick }: { busy: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} aria-label={label} className={removeClass}>
      {busy ? <Loader2 size={16} strokeWidth={2} className="animate-spin" /> : <X size={16} strokeWidth={1.8} />}
    </button>
  )
}

function useRemoving(remove: { mutate: (id: number, o?: { onSuccess?: () => void; onError?: () => void; onSettled?: () => void }) => void }) {
  const [removing, setRemoving] = useState<number | null>(null)
  function start(id: number, what: string) {
    setRemoving(id)
    remove.mutate(id, {
      onSuccess: () => toast(`Removed ${what}`),
      onError: () => toast("Couldn't remove that - please try again"),
      onSettled: () => setRemoving(null),
    })
  }
  return { removing, start }
}
const heading = 'mb-2 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint'

function dateChip(k: KeyDate) {
  if (k.days_until === null) return null
  const text = k.days_until === 0 ? 'Today' : k.days_until === 1 ? 'Tomorrow' : k.days_until <= 30 ? `In ${k.days_until} days` : null
  if (!text) return null
  return (
    <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[0.75rem] font-medium text-brand-ink">{text}</span>
  )
}

function KeyDates({ personId, dates }: { personId: number; dates: KeyDate[] }) {
  const add = useAddKeyDate(personId)
  const remove = useDeleteKeyDate(personId)
  const { removing, start: startRemove } = useRemoving(remove)
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<'birthday' | 'anniversary' | 'custom'>('birthday')
  const [label, setLabel] = useState('')
  const [subject, setSubject] = useState('self')
  const [name, setName] = useState('')
  const [month, setMonth] = useState(1)
  const [day, setDay] = useState('')
  const [year, setYear] = useState('')

  function save() {
    const dayNumber = day ? Number(day) : undefined
    add.mutate(
      {
        date_type: type,
        label: type === 'custom' ? label.trim() : undefined,
        subject,
        subject_name: subject !== 'self' && name.trim() ? name.trim() : undefined,
        month,
        day: dayNumber,
        year: year ? Number(year) : undefined,
      },
      {
        onSuccess: () => {
          setOpen(false)
          setLabel('')
          setName('')
          setDay('')
          setYear('')
        },
      },
    )
  }

  const canSave = (type !== 'custom' || label.trim().length > 0) && (!day || (Number(day) >= 1 && Number(day) <= 31))

  return (
    <>
      <h2 className={heading}>Key dates</h2>
      <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-bg-card">
        {dates.length === 0 && !open && (
          <p className="px-4 py-3 text-[0.9375rem] text-text-muted">No birthday or anniversary saved yet.</p>
        )}
        {dates.length > 0 && (
          <ul className="divide-y divide-border">
            {dates.map((k) => (
              <li key={k.id} className={`${rowClass} transition-opacity ${removing === k.id ? 'opacity-50' : ''}`}>
                <CalendarHeart size={18} strokeWidth={1.8} className="mt-0.5 flex-shrink-0 text-brand-ink" />
                <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug">
                  {dateChip(k) ? k.text.replace(/ \((today|tomorrow|in \d+ days)\)$/, '') : k.text}
                  {removing === k.id ? (
                    <span className="ml-2 text-[0.75rem] text-text-faint">Removing…</span>
                  ) : (
                    <>
                      {dateChip(k)}
                      {k.source === 'manual' && <span className="ml-2 text-[0.75rem] text-text-faint">added by you</span>}
                    </>
                  )}
                </span>
                <RemoveButton busy={removing === k.id} label="Remove this date" onClick={() => startRemove(k.id, 'the date')} />
              </li>
            ))}
          </ul>
        )}
        {open ? (
          <div className={`flex flex-col gap-2.5 p-3 ${dates.length > 0 ? 'border-t border-border' : ''}`}>
            <div className="grid grid-cols-2 gap-2">
              <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Kind of date">
                <option value="birthday">Birthday</option>
                <option value="anniversary">Anniversary</option>
                <option value="custom">Other</option>
              </Select>
              <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Whose date">
                {SUBJECTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </div>
            {type === 'custom' && <Input placeholder="What is it? e.g. Son's annual day" value={label} onChange={(e) => setLabel(e.target.value)} />}
            {subject !== 'self' && <Input placeholder="Their name (optional)" value={name} onChange={(e) => setName(e.target.value)} />}
            <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
              <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Month">
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </Select>
              <Input inputMode="numeric" placeholder="Day" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label="Day" />
              <Input inputMode="numeric" placeholder="Year" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Year (optional)" />
            </div>
            {add.isError && <p className="text-[0.8125rem] text-danger">That date isn't valid - check the month and day.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="pressable h-10 rounded-full px-4 text-sm text-text-muted">Cancel</button>
              <button type="button" onClick={save} disabled={!canSave || add.isPending} className="pressable h-10 rounded-full bg-accent px-5 text-sm font-medium text-accent-contrast disabled:opacity-40">
                {add.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className={`pressable flex w-full items-center gap-2 px-4 py-3 text-left text-[0.9375rem] font-medium text-link ${dates.length > 0 ? 'border-t border-border' : ''}`}>
            <Plus size={16} strokeWidth={2.2} /> Add a date
          </button>
        )}
      </section>
    </>
  )
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// What a value replaced, newest first: "Previously: Bangalore (until 25 Oct 2026), Pune (until 24 Oct 2026)".
function previously(f: PersonFact, history: PersonFact[]): string {
  const older = history
    .filter((h) => h.attribute === f.attribute && h.subject === f.subject && (h.subject_name ?? '') === (f.subject_name ?? ''))
    .sort((a, b) => (b.until ?? '').localeCompare(a.until ?? ''))
  return older.map((h) => `${h.value}${h.until ? ` (until ${shortDate(h.until)})` : ''}`).join(', ')
}

function Details({ personId, facts, history }: { personId: number; facts: PersonFact[]; history: PersonFact[] }) {
  const add = useAddPersonFact(personId)
  const remove = useDeletePersonFact(personId)
  const { removing, start: startRemove } = useRemoving(remove)
  const [attribute, setAttribute] = useState('likes')
  const [value, setValue] = useState('')

  // The legacy free-text recap lives under "Personal notes" below.
  const shown = facts.filter((f) => !['role', 'company', 'phone', 'email', 'trait', 'personal'].includes(f.attribute))

  function save() {
    const text = value.trim()
    if (!text) return
    add.mutate({ attribute, value: text }, { onSuccess: () => setValue('') })
  }

  return (
    <>
      <h2 className={heading}>Remembered details</h2>
      <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-bg-card">
        {shown.length > 0 && (
          <ul className="divide-y divide-border">
            {shown.map((f) => (
              <li key={f.id} className={`${rowClass} transition-opacity ${removing === f.id ? 'opacity-50' : ''}`}>
                <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug">
                  <span className="text-text-muted">{subjectPrefix(f.subject, f.subject_name)}{attributeLabel(f.attribute)} · </span>
                  {f.value}
                  {removing === f.id ? (
                    <span className="ml-2 text-[0.75rem] text-text-faint">Removing…</span>
                  ) : (
                    f.confidence === 'likely' && <span className="ml-2 text-[0.75rem] text-text-faint">possibly</span>
                  )}
                  {previously(f, history) && removing !== f.id && (
                    <span className="mt-0.5 block text-[0.8125rem] text-text-faint">Previously: {previously(f, history)}</span>
                  )}
                </span>
                <RemoveButton busy={removing === f.id} label="Remove this detail" onClick={() => startRemove(f.id, `“${attributeLabel(f.attribute)} · ${f.value}”`)} />
              </li>
            ))}
          </ul>
        )}
        <div className={`flex items-center gap-2 p-2 pl-3 ${shown.length > 0 ? 'border-t border-border' : ''}`}>
          <select value={attribute} onChange={(e) => setAttribute(e.target.value)} aria-label="Kind of detail" className="h-10 flex-shrink-0 rounded-lg bg-bg-elevated px-2 text-sm text-text">
            {ATTRIBUTES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <input
            placeholder="coffee over tea, trekking, Pune…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                save()
              }
            }}
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-text placeholder:text-text-faint focus:outline-none"
          />
          <button type="button" onClick={save} disabled={add.isPending || !value.trim()} aria-label="Add detail" className="pressable flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast disabled:opacity-30">
            <Plus size={20} strokeWidth={2.2} />
          </button>
        </div>
      </section>
    </>
  )
}

export default function PersonMemorySection({ personId, memory }: { personId: number; memory?: PersonMemory }) {
  const links = (memory?.relationships ?? []).filter((r) => r.relation !== 'colleague' || r.direction !== 'same_org')
  return (
    <>
      <KeyDates personId={personId} dates={memory?.key_dates ?? []} />
      <Details personId={personId} facts={memory?.facts ?? []} history={memory?.history ?? []} />
      {links.length > 0 && (
        <>
          <h2 className={heading}>Family &amp; connections</h2>
          <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-bg-card">
            <ul className="divide-y divide-border">
              {links.map((r) => (
                <li key={`${r.type}-${r.id}-${r.rel}-${r.direction}`}>
                  <Link to={`/people/${r.id}`} className="pressable flex items-center gap-2 px-4 py-2.5 text-[0.9375rem]">
                    <span className="min-w-0 flex-1">
                      <span className="text-link">{r.name}</span>
                      <span className="ml-2 text-[0.8125rem] text-text-muted">{r.relation ?? r.label ?? r.rel}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  )
}
