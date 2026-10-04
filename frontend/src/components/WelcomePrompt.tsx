import ConfiaLogo from './ConfiaLogo'
import Button from './Button'

// Shown once, the moment a brand-new user first lands on the app - a
// clear, prominent choice (start the tour or skip it) rather than
// dropping them straight into the Chat page with just a small corner
// nudge as the only hint that a tour exists. The step-by-step Tour
// itself stays a non-blocking corner card (see Tour.tsx) once it's
// actually running, since by then the user has already opted in and
// should be able to see the real page behind each step.
interface WelcomePromptProps {
  onStart: () => void
  onSkip: () => void
}

export default function WelcomePrompt({ onStart, onSkip }: WelcomePromptProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border-strong bg-bg-elevated p-6 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-text">
          <ConfiaLogo size={28} />
        </span>
        <h2 className="mb-2 text-lg font-semibold tracking-[-0.02em]">Welcome to MyConfía</h2>
        <p className="mb-6 text-sm leading-relaxed text-text-muted">
          Your personal memory for people, conversations, and follow-ups. Take a 90-second tour to see where
          everything lives?
        </p>
        <div className="flex flex-col gap-2">
          <Button type="button" variant="primary" onClick={onStart}>
            Start Tour
          </Button>
          <button type="button" onClick={onSkip} className="text-sm text-text-faint hover:text-text-muted">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
