import { useState } from 'react'
import { Brain, NotebookText, Sunrise, Users, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import Button from './Button'

// A centered step-card overlay, not a spotlight/DOM-anchored tour -
// deliberately simpler than highlighting live nav elements (no
// getBoundingClientRect positioning math, no new dependency). Borrows
// ConfirmDialog's backdrop/panel styling directly, since that's the only
// overlay precedent in the codebase.

interface Step {
  icon: LucideIcon
  title: string
  description: string
}

const STEPS: Step[] = [
  {
    icon: Brain,
    title: 'Log anything',
    description: 'Type or speak a note about anyone or anything — the AI figures out who it’s about and what to remember.',
  },
  {
    icon: NotebookText,
    title: 'Notes',
    description: 'Every note lands here, whether it’s about a person or just an idea, filterable by initiative.',
  },
  {
    icon: Sunrise,
    title: 'Digest',
    description: 'Your open tasks and today’s calendar, all in one place, plus a daily brief.',
  },
  {
    icon: Users,
    title: 'People',
    description: 'Everyone you’ve talked about, with their full history in one timeline.',
  },
  {
    icon: SettingsIcon,
    title: 'Settings',
    description: 'Manage your initiatives, theme, and privacy — and you can always take this tour again from here.',
  },
]

interface TourProps {
  onDone: () => void
}

export default function Tour({ onDone }: TourProps) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border-strong bg-bg-elevated p-6">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon size={24} />
        </div>
        <h3 className="mb-2 text-base font-semibold">{current.title}</h3>
        <p className="mb-6 text-sm leading-relaxed text-text-muted">{current.description}</p>

        <div className="mb-4 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-accent' : 'bg-border-strong'}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="text-sm text-text-faint hover:text-text-muted"
            onClick={onDone}
          >
            Skip
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
            >
              {isLast ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
