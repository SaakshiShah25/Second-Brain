import type { ReactNode } from 'react'
import { Brain } from 'lucide-react'
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
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Brain size={15} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-border bg-bg-card p-4">
        <p className="mb-3 text-sm">{prompt}</p>
        <div className="flex flex-col gap-2">
          {candidates.map((c, i) => (
            <button
              key={i}
              disabled={busy}
              onClick={() => onChoose(i)}
              className="flex items-center justify-between gap-2 rounded-lg border border-border-strong bg-bg-elevated px-3 py-2 text-left text-sm transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>{candidateLabel(c)}</span>
              <span className="flex-shrink-0 text-xs text-text-muted">{Math.round(c.score * 100)}% match</span>
            </button>
          ))}
          <button
            disabled={busy}
            onClick={onNone}
            className="rounded-lg border border-border-strong bg-bg-elevated px-3 py-2 text-left text-sm text-text-muted transition-colors hover:border-accent hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            {noneLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
