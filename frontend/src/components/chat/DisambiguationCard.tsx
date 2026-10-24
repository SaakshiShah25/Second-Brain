import type { ReactNode } from 'react'
import type { Candidate } from '../../api/types'

interface DisambiguationCardProps {
  prompt: ReactNode
  candidates: Candidate[]
  onChoose: (index: number) => void
  onNone: () => void
  noneLabel: string
  busy: boolean
}

function candidateLabel(c: Candidate) {
  const aliasStr = c.person.aliases.length ? ` (aka ${c.person.aliases.join(', ')})` : ''
  const roleCompany = [c.person.role, c.person.company].filter(Boolean).join(', ')
  const detail = roleCompany
    ? `${c.person.description || 'no description yet'} — ${roleCompany}`
    : c.person.description || 'no description yet'
  return `${c.person.name}${aliasStr} — ${detail}`
}

// Shared by both the capture and ask person-disambiguation flows in
// ChatPage.tsx - same card shape, just different prompt text and choice
// handlers.
export default function DisambiguationCard({ prompt, candidates, onChoose, onNone, noneLabel, busy }: DisambiguationCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-bg-card p-4" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <p className="mb-3 text-[0.9375rem] leading-relaxed">{prompt}</p>
      <div className="flex flex-col gap-2">
        {candidates.map((c, i) => (
          <button
            key={i}
            disabled={busy}
            onClick={() => onChoose(i)}
            className="pressable flex items-center justify-between gap-3 rounded-xl border border-border-strong bg-bg px-3.5 py-3 text-left text-sm disabled:opacity-50"
          >
            <span className="min-w-0">{candidateLabel(c)}</span>
            <span className="flex-shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              {Math.round(c.score * 100)}%
            </span>
          </button>
        ))}
        <button
          disabled={busy}
          onClick={onNone}
          className="pressable rounded-xl px-3.5 py-3 text-left text-sm font-medium text-link disabled:opacity-50"
        >
          {noneLabel}
        </button>
      </div>
    </div>
  )
}
