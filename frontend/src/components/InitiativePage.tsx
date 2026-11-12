import { useState } from 'react'
import { Check, ChevronRight, ChevronUp, FileText, NotebookText, Pencil } from 'lucide-react'
import { useUpdateInitiative } from '../api/initiatives'
import type { Interaction, ItemList as ListLabel, Task } from '../api/types'
import { getInitiativeStyle, initiativeBadgeStyle } from '../lib/initiativeStyle'
import AddToSpace from './AddToSpace'
import ExportInitiativeButton from './ExportInitiativeButton'
import InteractionCard, { ItemList } from './InteractionCard'
import InitiativeThings, { SectionHeader, thingCounts } from './InitiativeThings'
import { noteCounts, noteItems, noteSections } from '../lib/noteSections'
import { shortDate } from '../lib/dates'

type Ini = { id: number; name: string; color: string | null } | null

interface Props {
  // 0 = Others (notes with no initiative)
  id: number
  initiative: Ini
  notes: Interaction[]
  // The to-dos and list entries that belong to this initiative (everything that isn't a note).
  items?: Task[]
  // Labels (lists) made for this space, shown even before they hold anything.
  labels?: ListLabel[]
}

function Heading({ initiative, size = 'md' }: { initiative: Ini; size?: 'md' | 'lg' }) {
  const style = getInitiativeStyle(initiative)
  const box = size === 'lg' ? 'h-10 w-10 rounded-xl' : 'h-8 w-8 rounded-lg'
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        className={`flex flex-shrink-0 items-center justify-center ${box} ${style ? '' : 'bg-bg-elevated text-text-muted'}`}
        style={style ? initiativeBadgeStyle(style.color) : undefined}
      >
        {style ? <style.Icon size={size === 'lg' ? 20 : 16} strokeWidth={2} /> : <FileText size={16} strokeWidth={2} />}
      </span>
      <span className={`truncate font-semibold tracking-tight ${size === 'lg' ? 'text-xl' : 'text-[1.0625rem]'}`}>
        {initiative?.name ?? 'Others'}
      </span>
    </span>
  )
}

const PREVIEW_POINTS = 4

// One initiative on the Notes overview: how many notes it holds and a glimpse of its latest points. Tapping opens the full page.
export function InitiativeBlock({ initiative, notes, items = [], onOpen }: Props & { onOpen: () => void }) {
  // The newest notes' key points first, a handful in all - all of it extracted when the notes were logged.
  const latest = [...notes]
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id)
    .flatMap((n) => noteItems(n))
    .slice(0, PREVIEW_POINTS)

  return (
    <section className="rounded-2xl border border-border bg-bg-card">
      <button type="button" onClick={onOpen} className="pressable block w-full px-4 pt-3.5 pb-3.5 text-left">
        <span className="flex items-center gap-2">
          <Heading initiative={initiative} />
          <ChevronRight size={18} strokeWidth={2} className="ml-auto flex-shrink-0 text-text-faint" />
        </span>
        <span className="mt-1.5 block pl-[2.625rem] text-[0.8125rem] text-text-faint">
          {[notes.length ? noteCounts(notes) : '', thingCounts(items)].filter(Boolean).join(' · ') || 'Nothing yet'}
        </span>
        {latest.length > 0 && (
          <span className="mt-3 block">
            <ItemList items={latest} max={PREVIEW_POINTS} />
          </span>
        )}
      </button>
    </section>
  )
}

// The whole space as one page, in four clearly separate parts, each with its own + and its own edit:
//   the space itself (its name; edit = rename)
//   Notes   (+ adds a note;  edit = open, change or delete the notes as written)
//   To-dos  (+ adds a to-do; edit = remove to-dos)
//   Lists   (+ starts a list, the + on a list adds to it; edit = rename / remove lists and entries)
// The Notes part shows the key points, decisions and concerns extracted from the notes when they were logged, grouped
// under each note's topic - nothing here calls an AI model.
export function InitiativeView({ initiative, notes, items = [], labels = [], onCollapse }: Props & { onCollapse?: () => void }) {
  // Space-level edit: rename. Notes-level edit: the notes as written, each one openable to change or delete.
  const [editingSpace, setEditingSpace] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const updateInitiative = useUpdateInitiative()
  // Tapping a key point opens the note it came from.
  const [openNoteId, setOpenNoteId] = useState<number | null>(null)
  const openNote = notes.find((n) => n.id === openNoteId) ?? null
  const style = getInitiativeStyle(initiative)
  const sections = noteSections(notes)
  const spaceName = initiative?.name ?? 'Others'

  return (
    <div>
      {/* The space itself. */}
      <div className="mb-6 rounded-2xl border border-border bg-bg-card p-4">
        <div className="flex items-center gap-2">
          {editingSpace && initiative ? (
            <input
              defaultValue={initiative.name}
              aria-label="Space name"
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (!name || name === initiative.name) return (e.target.value = initiative.name)
                updateInitiative.mutate(
                  { id: initiative.id, fields: { name } },
                  { onError: () => (e.target.value = initiative.name) },
                )
              }}
              className="min-w-0 flex-1 rounded-lg border border-border-strong bg-bg-card px-2 py-1.5 text-xl font-semibold tracking-tight focus:border-accent focus:outline-none"
            />
          ) : (
            <Heading initiative={initiative} size="lg" />
          )}
          <span className="ml-auto flex items-center gap-2">
            <ExportInitiativeButton name={spaceName} notes={notes} />
            {initiative && (
              <button
                type="button"
                onClick={() => setEditingSpace((v) => !v)}
                aria-label={editingSpace ? 'Done editing the space' : 'Edit this space'}
                aria-pressed={editingSpace}
                className={`pressable flex h-9 w-9 items-center justify-center rounded-full ${editingSpace ? 'bg-accent-soft text-accent' : 'text-text-muted'}`}
              >
                {editingSpace ? <Check size={18} strokeWidth={2.4} /> : <Pencil size={17} strokeWidth={2} />}
              </button>
            )}
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                aria-label="Collapse"
                className="pressable flex h-9 w-9 items-center justify-center rounded-full text-text-muted"
              >
                <ChevronUp size={20} strokeWidth={2} />
              </button>
            )}
          </span>
        </div>
        <p className="mt-2 pl-[3.125rem] text-[0.8125rem] text-text-faint">
          {editingSpace ? 'Rename the space, then tap ✓.' : [notes.length ? noteCounts(notes) : '', thingCounts(items)].filter(Boolean).join(' · ') || 'Nothing yet'}
        </p>
      </div>

      {/* Notes. */}
      <section className="mb-6" aria-label="Notes">
        <SectionHeader
          icon={NotebookText}
          title="Notes"
          count={notes.length}
          add={<AddToSpace spaceId={initiative?.id ?? null} spaceName={spaceName} kind="note" />}
          editing={editingNotes}
          onEdit={notes.length ? () => setEditingNotes((v) => !v) : undefined}
          editLabel="Edit notes"
        />
        {!editingNotes && (
          <div className="rounded-2xl border border-border bg-bg-card p-4">
            {sections.map((s, n) => (
              <div key={s.key} className={n === 0 ? '' : 'mt-3'}>
                {s.title && (
                  <h3 className="mb-2 text-[0.8125rem] font-semibold uppercase tracking-wide" style={{ color: style?.color }}>
                    {s.title}
                  </h3>
                )}
                {s.groups.map((g) => (
                  <div key={g.kind} className="mb-2.5 last:mb-0">
                    {g.kind !== 'point' && (
                      <p className="mb-1 text-[0.9375rem] font-bold" style={{ color: style?.color }}>
                        {g.label}:
                      </p>
                    )}
                    <ul className="flex flex-col gap-1">
                      {g.items.map((it, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            onClick={() => it.noteId && setOpenNoteId(it.noteId)}
                            className="pressable flex w-full items-baseline gap-2.5 text-left text-[0.9375rem] leading-snug"
                          >
                            <span className="mt-[0.5rem] h-1.5 w-1.5 flex-shrink-0 translate-y-[-0.1rem] rounded-full bg-text-faint" />
                            <span className="min-w-0 flex-1">{it.text}</span>
                            {it.date && <span className="flex-shrink-0 text-[0.75rem] text-text-faint">{shortDate(it.date)}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
            {sections.length === 0 && (
              <p className="text-[0.9375rem] text-text-muted">
                {notes.length === 0 ? 'No notes here yet - tap + to write one.' : 'No key points were extracted - tap the pencil to see the notes as written.'}
              </p>
            )}
          </div>
        )}
        {editingNotes && (
          <>
            <p className="mb-2 px-1 text-[0.8125rem] text-text-muted">Editing notes: tap a note to change or delete it. Tap ✓ when done.</p>
            <div className="flex flex-col gap-2.5">
              {[...notes]
                .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id)
                .map((n) => (
                  <InteractionCard key={n.id} interaction={n} variant="source" />
                ))}
            </div>
          </>
        )}
      </section>

      {/* To-dos and Lists - each its own part, with its own + and pencil. */}
      <InitiativeThings items={items} labels={labels} spaceId={initiative?.id ?? null} spaceName={spaceName} />

      {openNote && (
        // The note's sheet floats above the page, so the card itself stays out of sight.
        <div hidden>
          <InteractionCard key={openNote.id} interaction={openNote} autoOpen onClosed={() => setOpenNoteId(null)} />
        </div>
      )}
    </div>
  )
}
