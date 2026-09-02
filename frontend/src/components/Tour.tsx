import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ListTree,
  MessageSquare,
  NotebookText,
  Settings as SettingsIcon,
  Sunrise,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Button from './Button'

// Unlike a spotlight tour (highlighting a specific element on the
// current page), this ACTUALLY NAVIGATES to each section as the tour
// advances - so "here's Notes" means the user is genuinely looking at
// the Notes page while reading that step, not a description floating
// over wherever they happened to open the tour from. The card itself is
// a small non-blocking overlay (no dark backdrop) anchored to a corner,
// so the real page stays fully visible underneath it.

interface Step {
  icon: LucideIcon
  title: string
  description: string
  path: string
}

const STEPS: Step[] = [
  {
    icon: MessageSquare,
    title: 'Log anything',
    description: 'Type or speak a note about anyone or anything — the AI figures out who it’s about and what to remember.',
    path: '/',
  },
  {
    icon: NotebookText,
    title: 'Notes',
    description: 'Every note lands here, whether it’s about a person or just an idea, filterable by initiative.',
    path: '/notes',
  },
  {
    icon: ListTree,
    title: 'Initiatives',
    description: 'This tab is where you manage your own categories — Job, Fitness, Personal, or anything else — that notes get automatically sorted into.',
    path: '/notes?tab=initiatives',
  },
  {
    icon: Sunrise,
    title: 'Today',
    description: 'Your open tasks and today’s calendar, all in one place, plus a daily brief.',
    path: '/digest',
  },
  {
    icon: Users,
    title: 'People',
    description: 'Everyone you’ve talked about, with their full history in one timeline.',
    path: '/people',
  },
  {
    icon: SettingsIcon,
    title: 'Settings',
    description: 'Manage your theme, text size, and privacy — and you can always take this tour again from here.',
    path: '/settings',
  },
]

interface TourProps {
  onDone: () => void
}

export default function Tour({ onDone }: TourProps) {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  // Navigate to whatever section this step is about, every time the step
  // changes (including going back) - `replace: true` so stepping through
  // the tour doesn't fill up browser history with tour-only stops.
  useEffect(() => {
    navigate(current.path, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  return (
    <div className="fixed inset-x-4 bottom-20 z-50 flex justify-center md:inset-x-auto md:bottom-6 md:right-6 md:justify-end">
      <div className="w-full max-w-sm rounded-xl border border-border-strong bg-bg-elevated p-5 shadow-lg">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon size={18} strokeWidth={1.6} />
          </span>
          <h3 className="text-base font-semibold">{current.title}</h3>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-text-muted">{current.description}</p>

        <div className="mb-3 flex justify-center gap-1.5">
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
