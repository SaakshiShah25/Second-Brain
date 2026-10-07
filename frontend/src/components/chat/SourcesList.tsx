import { useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AnswerSource } from '../../api/types'

// "Where did this answer come from?" - the notes the AI was actually
// given when it wrote the reply. Collapsed by default so a short answer
// stays short, one tap to check it against the real notes. Each note
// links to its person (or the Notes page for a personal note) so the
// original can be opened and read in full.
export default function SourcesList({ sources, total }: { sources: AnswerSource[]; total?: number }) {
  const [open, setOpen] = useState(false)
  if (sources.length === 0) return null

  const used = total ?? sources.length
  const label =
    used > sources.length
      ? `Based on ${used} notes (showing the ${sources.length} most recent)`
      : `Based on ${used} note${used === 1 ? '' : 's'}`

  return (
    <div className="mt-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
      >
        <FileText size={12} strokeWidth={1.8} className="flex-shrink-0" />
        {label}
        <ChevronDown
          size={12}
          strokeWidth={1.8}
          className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {sources.map((s) => (
            <li key={s.id} className="rounded-lg bg-bg-elevated px-3 py-2 text-xs text-text-muted">
              <div className="flex flex-wrap items-center gap-x-1.5">
                <span className="font-medium text-text">{s.date ?? 'No date'}</span>
                <span aria-hidden>·</span>
                {s.person ? (
                  <Link to={`/people/${s.person.id}`} className="text-accent hover:underline">
                    {s.person.name}
                  </Link>
                ) : (
                  <Link to="/notes" className="text-accent hover:underline">
                    Personal note
                  </Link>
                )}
                {s.secondary && <span className="text-text-faint">(mentioned in this note)</span>}
              </div>
              {s.summary && <p className="mt-0.5 leading-snug">{s.summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
