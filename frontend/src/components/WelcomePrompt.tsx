import ConfiaLogo from './ConfiaLogo'
import Button from './Button'
import Sheet from './Sheet'

// Shown once, the moment a brand-new user first lands on the app - a
// clear choice (start the tour or skip it) rather than dropping them
// straight onto Home with no hint a tour exists. The step-by-step Tour
// itself stays non-blocking once running, so the real screen behind each
// step stays visible.
interface WelcomePromptProps {
  onStart: () => void
  onSkip: () => void
}

export default function WelcomePrompt({ onStart, onSkip }: WelcomePromptProps) {
  return (
    <Sheet>
      <div className="pt-2 text-center">
        <span className="mx-auto mb-4 flex justify-center text-text">
          <ConfiaLogo size={52} />
        </span>
        <h2 className="mb-2 font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.03em]">
          Welcome to MyConfía
        </h2>
        <p className="mx-auto mb-7 max-w-xs text-[0.9375rem] leading-relaxed text-text-muted">
          Your personal memory for people, conversations and follow-ups. Take a 60-second tour?
        </p>
        <div className="flex flex-col gap-2">
          <Button type="button" variant="primary" size="lg" block onClick={onStart}>
            Show me around
          </Button>
          <Button type="button" variant="ghost" size="lg" block onClick={onSkip}>
            Skip for now
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
