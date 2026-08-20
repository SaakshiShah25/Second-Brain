import { Mic } from 'lucide-react'

// The dominant thing on screen in Log-a-note mode - the common case is
// someone who just finished a conversation and wants to talk it out
// hands-free right away, not type. Typing is still fully supported via
// the small link below (and the normal input bar underneath), just not
// the first thing your thumb lands on.
export default function RecordCallToAction({ onTap, onTypeInstead }: { onTap: () => void; onTypeInstead: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <button
        type="button"
        onClick={onTap}
        className="flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 transition-transform hover:scale-105 hover:bg-accent-hover active:scale-95"
      >
        <Mic size={40} strokeWidth={2} />
      </button>
      <p className="text-base font-semibold text-text">Tap to Record</p>
      <p className="max-w-xs text-sm text-text-muted">
        Talk through who you met and what you discussed - I'll pull out the details.
      </p>
      <button type="button" onClick={onTypeInstead} className="mt-2 text-sm text-accent underline-offset-2 hover:underline">
        or type your note instead
      </button>
    </div>
  )
}
