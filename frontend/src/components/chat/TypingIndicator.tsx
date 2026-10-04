import { useEffect, useState } from 'react'
import ConfiaLogo from '../ConfiaLogo'

// Stage names match the `stage` SSE events api/routers/chat.py's
// /api/chat/stream emits, in order: moderating -> classifying ->
// (extracting -> saving) | thinking -> [result]. ChatPage.tsx wires
// these through live via useChat's onStage, so this label genuinely
// reflects what the backend is doing right now, not a guess.
const STAGE_LABELS: Record<string, string> = {
  moderating: 'Checking your message…',
  classifying: 'Figuring out what this is…',
  extracting: 'Extracting the details…',
  saving: 'Saving…',
  thinking: 'Looking through your notes…',
}

// extraction is the one stage with real, wide variance (2026-10 timing
// instrumentation saw anywhere from ~3s to ~40s for the same kind of
// note, entirely from upstream LLM latency) - everything else in the
// pipeline is consistently sub-second, so only this stage gets a
// follow-up reassurance if it runs long.
const SLOW_STAGE = 'extracting'
const SLOW_STAGE_HINT_MS = 15000

export default function TypingIndicator({ stage }: { stage?: string | null }) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    setElapsedMs(0)
    const start = Date.now()
    const interval = setInterval(() => setElapsedMs(Date.now() - start), 1000)
    return () => clearInterval(interval)
  }, [stage])

  const label = (stage && STAGE_LABELS[stage]) || null
  const showSlowHint = stage === SLOW_STAGE && elapsedMs >= SLOW_STAGE_HINT_MS

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-text">
        <ConfiaLogo size={15} />
      </div>
      <div className="flex items-center gap-2 py-1">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-text-faint"
              style={{ animation: 'typing-bounce 1.2s infinite', animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        {label && (
          <span className="text-xs text-text-muted">
            {showSlowHint ? 'Longer notes take a bit more time to process…' : label}
          </span>
        )}
      </div>
    </div>
  )
}
