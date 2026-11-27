import { Keyboard, Mic, MicOff, X } from 'lucide-react'
import type { VoiceProblem } from '../../lib/useVoiceInput'

// "We didn't catch that": a card right above the mic - where the eyes already are - instead of a line of plain text among
// the chat's replies, which was easy to read past and think the note had been saved. It slides in with a small shake
// and offers the two ways forward.
export default function VoiceAlert({ problem, onRetry, onType, onClose }: { problem: VoiceProblem; onRetry: () => void; onType: () => void; onClose: () => void }) {
  return (
    <div role="alert" className="voice-alert mb-2.5 overflow-hidden rounded-2xl border-2 border-accent bg-bg-card shadow-card">
      <div className="flex items-start gap-3 bg-accent-soft p-3.5">
        <span className="voice-alert-icon flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast">
          <MicOff size={22} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[1rem] font-bold leading-snug">{problem.title}</p>
          <p className="mt-0.5 text-[0.875rem] leading-snug text-text-muted">{problem.detail}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" onClick={onRetry} className="pressable flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[0.875rem] font-semibold text-accent-contrast">
              <Mic size={15} strokeWidth={2.4} />
              Try again
            </button>
            <button type="button" onClick={onType} className="pressable flex h-9 items-center gap-1.5 rounded-full border border-border-strong bg-bg-card px-3.5 text-[0.875rem] font-medium">
              <Keyboard size={15} strokeWidth={2} />
              Type instead
            </button>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Dismiss" className="pressable -m-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-text-muted">
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}
