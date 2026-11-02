import { useState } from 'react'
import { MapPin, Pencil, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useCreateInitiative, useInitiatives } from '../../api/initiatives'
import { useUpdateInteraction } from '../../api/notes'
import type { CapturePart, CaptureSavedResult } from '../../api/types'
import { dueLabel } from '../../lib/dates'
import { notePoints } from '../../lib/initiativeFilter'
import { getInitiativeStyle } from '../../lib/initiativeStyle'
import Button from '../Button'
import CategorySheet from '../CategorySheet'
import { Input } from '../fields'

// The reply to a logged note: ONE card, with a section per initiative it touched, in that initiative's colour -
//   Category: <name>
//   (key points)  Tasks:  Decisions:  Concerns:
// Everything about one initiative sits together; nothing is repeated between the lists (extraction
// keeps each fact in exactly one), and there are no divider lines - just a coloured edge per section.

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-[0.9375rem] leading-snug">
          <span className="mt-[0.5rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-faint" />
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  )
}

// Everything shares one look: bold headings in the initiative's colour (Others in a neutral grey).
const OTHERS_COLOR = '#78716c'

function Label({ children, color }: { children: string; color: string }) {
  return (
    <p className="mt-3 text-[0.9375rem] font-bold" style={{ color }}>
      {children}
    </p>
  )
}

// "Create the category <name>?" - a proposed new category is never created without the user saying yes. Until
// then the note sits in Others. Create it as proposed, rename it first, or leave the note in Others ("Not now").
function Suggestion({ part, color, onResolved }: { part: CapturePart; color: string; onResolved: (patch: Partial<CapturePart>) => void }) {
  const createInitiative = useCreateInitiative()
  const updateInteraction = useUpdateInteraction()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(part.suggested_initiative ?? '')
  const [error, setError] = useState('')
  const busy = createInitiative.isPending || updateInteraction.isPending

  async function create(finalName: string) {
    const clean = finalName.trim()
    if (!clean || busy) return
    setError('')
    try {
      const made = await createInitiative.mutateAsync({ name: clean })
      await updateInteraction.mutateAsync({ interactionId: part.interaction_id, fields: { initiative_id: made.id } })
      onResolved({ initiative_id: made.id, initiative_name: made.name, suggested_initiative: null })
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't create that category - please try again.")
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-bg-elevated p-3">
      <p className="text-[0.8125rem] text-text-muted">New category?</p>
      {renaming ? (
        <div className="mt-1.5 flex flex-col gap-2">
          <Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create(name)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" disabled={busy} onClick={() => setRenaming(false)}>
              Back
            </Button>
            <Button size="sm" variant="primary" disabled={busy || !name.trim()} onClick={() => create(name)}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-0.5 text-[0.9375rem] leading-snug">
            File this under a new category called <span className="font-bold" style={{ color }}>{part.suggested_initiative}</span>?
          </p>
          <div className="mt-2.5 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onResolved({ suggested_initiative: null })}>
              Not now
            </Button>
            <Button size="sm" disabled={busy} onClick={() => setRenaming(true)}>
              Rename
            </Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => create(part.suggested_initiative ?? '')}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </>
      )}
      {error && <p className="mt-2 text-[0.8125rem] text-danger">{error}</p>}
    </div>
  )
}

function Section({
  part,
  color,
  Icon,
  onChange,
}: {
  part: CapturePart
  color: string
  Icon?: LucideIcon
  onChange: (patch: Partial<CapturePart>) => void
}) {
  const points = notePoints(part.summary)
  const updateInteraction = useUpdateInteraction()
  const { data: initiatives = [] } = useInitiatives()
  const [changing, setChanging] = useState(false)
  return (
    <section className="py-1 pl-3.5" style={{ borderLeft: `3px solid ${color}` }}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[1rem] font-bold" style={{ color }}>
        <span className="flex items-center gap-1.5">
          {Icon && <Icon size={16} strokeWidth={2.4} className="flex-shrink-0" />}
          Category: {part.initiative_name ?? 'Others'}
        </span>
        <button
          type="button"
          onClick={() => setChanging(true)}
          aria-label="Change category"
          className="pressable flex items-center gap-1 rounded-full border border-border-strong px-2 py-0.5 text-[0.75rem] font-medium text-text-muted"
        >
          <Pencil size={11} strokeWidth={2.2} />
          Change
        </button>
      </p>
      {part.suggested_initiative && part.initiative_id === null && <Suggestion part={part} color={color} onResolved={onChange} />}
      {points.length > 0 && <List items={points} />}
      {part.tasks_created.length > 0 && (
        <>
          <Label color={color}>Tasks:</Label>
          <List
            items={part.tasks_created.map((t) => (
              <>
                {t.description}
                {t.due_date && <span className="text-text-muted"> · due {dueLabel(t.due_date, t.due_time)}</span>}
                {t.owner === 'them' && <span className="text-them-task"> · someone else owes this</span>}
              </>
            ))}
          />
        </>
      )}
      {part.decisions.length > 0 && (
        <>
          <Label color={color}>Decisions:</Label>
          <List items={part.decisions} />
        </>
      )}
      {part.concerns.length > 0 && (
        <>
          <Label color={color}>Concerns:</Label>
          <List items={part.concerns} />
        </>
      )}
      {changing && (
        <CategorySheet
          title="Which category should this go in?"
          currentId={part.initiative_id}
          onClose={() => setChanging(false)}
          onPick={async (id) => {
            // The note moves, and so do the tasks it created (the Tasks tab groups them by their note's category).
            await updateInteraction.mutateAsync({ interactionId: part.interaction_id, fields: { initiative_id: id } })
            onChange({
              initiative_id: id,
              initiative_name: id === null ? null : initiatives.find((i) => i.id === id)?.name ?? part.initiative_name,
              suggested_initiative: null,
            })
          }}
        />
      )}
    </section>
  )
}

export default function CaptureReply({
  result,
  onChange,
}: {
  result: CaptureSavedResult
  // Called with the updated reply when the user changes where a part went (so the card keeps showing the truth).
  onChange?: (result: CaptureSavedResult) => void
}) {
  const { data: initiatives } = useInitiatives()
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-bg-card px-4 py-3.5">
      {result.parts.map((part) => {
        const initiative = initiatives?.find((i) => i.id === part.initiative_id)
        const style = getInitiativeStyle(initiative ?? (part.initiative_name ? { id: part.initiative_id ?? 0, name: part.initiative_name, color: null } : null))
        return (
          <Section
            key={part.interaction_id}
            part={part}
            color={style?.color ?? OTHERS_COLOR}
            Icon={style?.Icon}
            onChange={(patch) =>
              onChange?.({ ...result, parts: result.parts.map((p) => (p.interaction_id === part.interaction_id ? { ...p, ...patch } : p)) })
            }
          />
        )
      })}
      {result.date_warning && (
        <p className="flex items-start gap-1.5 text-[0.8125rem] text-text-muted">
          <TriangleAlert size={14} strokeWidth={2} className="mt-0.5 flex-shrink-0" /> {result.date_warning}
        </p>
      )}
      {result.skipped_due_dates.map((d) => (
        <p key={d.description} className="flex items-start gap-1.5 text-[0.8125rem] text-text-muted">
          <TriangleAlert size={14} strokeWidth={2} className="mt-0.5 flex-shrink-0" />
          Couldn't set a due date for "{d.description}" (got '{d.raw_due_date}') - saved without one.
        </p>
      ))}
      {result.maps_url && (
        <p className="flex items-center gap-1.5 text-[0.8125rem]">
          <MapPin size={14} strokeWidth={2} className="flex-shrink-0 text-text-muted" />
          <a href={result.maps_url} target="_blank" rel="noreferrer" className="text-link">
            {result.geo_address ?? 'Attached location'}
          </a>
        </p>
      )}
    </div>
  )
}
