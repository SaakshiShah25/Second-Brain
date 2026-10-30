import { MapPin, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useInitiatives } from '../../api/initiatives'
import type { CapturePart, CaptureSavedResult } from '../../api/types'
import { dueLabel } from '../../lib/dates'
import { notePoints } from '../../lib/initiativeFilter'
import { getInitiativeStyle } from '../../lib/initiativeStyle'

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

function Section({ part, color, Icon }: { part: CapturePart; color: string; Icon?: LucideIcon }) {
  const points = notePoints(part.summary)
  return (
    <section className="py-1 pl-3.5" style={{ borderLeft: `3px solid ${color}` }}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[1rem] font-bold" style={{ color }}>
        <span className="flex items-center gap-1.5">
          {Icon && <Icon size={16} strokeWidth={2.4} className="flex-shrink-0" />}
          Category: {part.initiative_name ?? 'Others'}
        </span>
        {part.new_initiative && (
          <span className="rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide" style={{ background: `${color}22` }}>
            New
          </span>
        )}
      </p>
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
    </section>
  )
}

export default function CaptureReply({ result }: { result: CaptureSavedResult }) {
  const { data: initiatives } = useInitiatives()
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-bg-card px-4 py-3.5">
      {result.parts.map((part) => {
        const initiative = initiatives?.find((i) => i.id === part.initiative_id)
        const style = getInitiativeStyle(initiative ?? (part.initiative_name ? { id: part.initiative_id ?? 0, name: part.initiative_name, color: null } : null))
        return <Section key={part.interaction_id} part={part} color={style?.color ?? OTHERS_COLOR} Icon={style?.Icon} />
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
