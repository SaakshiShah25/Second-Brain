import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import type { Interaction } from '../api/types'
import { getInitiativeStyle, initiativeBadgeStyle } from '../lib/initiativeStyle'
import InteractionCard, { ItemList } from './InteractionCard'
import { noteCounts, noteItems, noteSections } from '../lib/noteSections'
import { shortDate } from '../lib/dates'

type Ini = { id: number; name: string; color: string | null } | null

interface Props {
  // 0 = Others (notes with no initiative)
  id: number
  initiative: Ini
  notes: Interaction[]
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
export function InitiativeBlock({ initiative, notes, onOpen }: Props & { onOpen: () => void }) {
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
          {noteCounts(notes)}
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

// The whole initiative as one page: the key points, decisions and concerns that were extracted from its notes when
// they were logged, grouped under each note's topic label - then the notes themselves, as written ("Source notes").
// Nothing here calls an AI model.
export function InitiativeView({ initiative, notes }: Props) {
  const [showSource, setShowSource] = useState(false)
  // Tapping an item opens the note it came from.
  const [openNoteId, setOpenNoteId] = useState<number | null>(null)
  const openNote = notes.find((n) => n.id === openNoteId) ?? null
  const style = getInitiativeStyle(initiative)
  const sections = noteSections(notes)

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-border bg-bg-card p-4">
        <Heading initiative={initiative} size="lg" />

        <p className="mt-2 pl-[3.125rem] text-[0.8125rem] text-text-faint">{noteCounts(notes)}</p>

        {sections.map((s) => (
          <div key={s.key} className="mt-5">
            {s.title && (
              <h3
                className="mb-2 text-[0.8125rem] font-semibold uppercase tracking-wide"
                style={{ color: style?.color }}
              >
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
          <p className="mt-3 text-[0.9375rem] text-text-muted">
            {notes.length === 0 ? 'No notes here yet.' : 'No key points were extracted - see the source notes below.'}
          </p>
        )}
      </div>

      {openNote && (
        // The note's sheet floats above the page, so the card itself stays out of sight.
        <div hidden>
          <InteractionCard key={openNote.id} interaction={openNote} autoOpen onClosed={() => setOpenNoteId(null)} />
        </div>
      )}

      {notes.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            aria-expanded={showSource}
            className="pressable mb-2 flex items-center gap-1.5 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint"
          >
            Source notes
            <span className="font-medium normal-case tracking-normal">· {notes.length}</span>
            <ChevronDown size={15} strokeWidth={2.2} className={showSource ? 'rotate-180' : ''} />
          </button>
          {showSource && (
            <div className="flex flex-col gap-2.5">
              {[...notes]
                .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id)
                .map((n) => (
                  <InteractionCard key={n.id} interaction={n} variant="source" />
                ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
