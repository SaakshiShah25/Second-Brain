import { useCallback, useLayoutEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ListTree,
  MessageCircleQuestion,
  MessageSquare,
  NotebookText,
  Settings as SettingsIcon,
  ListChecks,
  type LucideIcon,
} from 'lucide-react'
import { useUsageMode } from '../lib/usageMode'
import Button from './Button'

// A real spotlight tour, not a card floating in a fixed corner - it
// ACTUALLY NAVIGATES to each section as it advances (so "here's Notes"
// means the user is genuinely looking at the Notes page while reading
// that step), AND it finds the real on-screen nav icon for that section
// (Layout.tsx tags each one with data-tour-nav) and dims everything else
// around it. A card in a corner relied entirely on its own wording to
// say which of five icons it meant - easy to miss, especially on the
// tightly-packed mobile bottom nav. Cutting a hole in a dimmed backdrop
// around the actual icon, with an arrow and a card anchored right next
// to it, is how most onboarding tours (Notion, Linear, Intercom-style
// product tours) solve exactly this - so borrowing that pattern here
// instead of reinventing one.
//
// The dim/hole itself is a single element: a box sized to the target
// icon with a huge `box-shadow` spread - the spread paints the "rest of
// the screen is dark" effect without a second overlay element, and (not
// being a real covering element) doesn't block clicks elsewhere, so the
// underlying page stays genuinely interactive during the tour, matching
// this component's original non-blocking intent.

interface Step {
  icon: LucideIcon
  title: string
  description: string
  path: string
  // Which [data-tour-nav] element to spotlight, when it isn't the tab for
  // `path` itself (Settings lives behind the profile button on a tab).
  target?: string
}

const STEPS: Step[] = [
  {
    icon: MessageSquare,
    title: 'Log anything',
    description: 'Type or tap the mic and talk about anything — the AI works out what to remember and what you need to do, and by when.',
    path: '/',
  },
  {
    icon: MessageCircleQuestion,
    title: 'Ask anything',
    description: 'The same box doubles as search — ask “what did I note about pricing?” and it answers from your own notes.',
    path: '/',
  },
  {
    icon: ListChecks,
    title: 'Tasks',
    description: 'Every to-do from your notes, grouped under its initiative — tick it off, or change who owes it and by when.',
    path: '/tasks',
  },
  {
    icon: NotebookText,
    title: 'Notes',
    description: 'Every note lands here as a few short points, with its tasks ready to tick off.',
    path: '/notes',
  },
  {
    icon: ListTree,
    title: 'Initiatives',
    description: 'Your own categories — Job, Fitness, Personal, anything. Notes are sorted into them automatically; tap one at the top of Today or Notes to see just its tasks and notes.',
    path: '/notes',
  },
  {
    icon: SettingsIcon,
    title: 'Settings',
    description: 'Tap your initial up here for theme, text size, app lock and privacy — and to take this tour again.',
    path: '/notes',
    target: '/settings',
  },
]

// The first two steps' examples follow what the account is used for.
const MODE_COPY: Record<'work' | 'personal' | 'both', Record<number, string>> = {
  work: {
    0: 'Type or tap the mic after a meeting or call — the AI works out what was agreed and what you owe, and by when.',
    1: 'The same box doubles as search — ask “what did I note about pricing?” or “what’s overdue?”.',
  },
  personal: {
    0: 'Type or tap the mic to jot down anything — a thought, a plan, or a reminder for later.',
    1: 'The same box doubles as search — ask “what’s coming up this week?” or “what did I note about the trip?”',
  },
  both: {},
}

// How far the spotlight hole extends past the icon's own edges, and how
// far the arrow/card sit past the spotlight's edge.
const PAD = 8
const GAP = 12
const ARROW = 7 // half-width of the 14px arrow triangle

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
}

interface TourProps {
  onDone: () => void
}

export default function Tour({ onDone }: TourProps) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<TargetRect | null>(null)
  // Tab-bar targets sit at the bottom (card above, arrow pointing down);
  // the profile button sits at the top (card below, arrow pointing up).
  const [below, setBelow] = useState(false)
  const navigate = useNavigate()
  const { mode } = useUsageMode()
  const current = { ...STEPS[step], description: MODE_COPY[mode][step] ?? STEPS[step].description }
  const Icon = current.icon
  const isLast = step === STEPS.length - 1
  const basePath = current.target ?? current.path.split('?')[0]

  // Finds the real, currently-VISIBLE element for this step - skips any
  // zero-sized match (an element that's mounted but not displayed).
  const measure = useCallback(() => {
    const els = document.querySelectorAll<HTMLElement>(`[data-tour-nav="${basePath}"]`)
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.width > 0) {
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        setBelow(r.top < window.innerHeight / 2)
        return
      }
    }
    setRect(null)
  }, [basePath])

  // useLayoutEffect, not useEffect - measuring and positioning the
  // spotlight before the browser paints avoids a one-frame flash of the
  // PREVIOUS step's position on top of the newly-navigated page.
  useLayoutEffect(() => {
    navigate(current.path, { replace: true })
    measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useLayoutEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const card = (
    <div
      key={step}
      className="w-full max-w-sm rounded-3xl border border-border bg-bg-card p-5 shadow-card"
      style={{ animation: 'tour-card-in 0.25s ease-out' }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
          <Icon size={20} strokeWidth={1.8} />
        </span>
        <h3 className="font-display tracking-[-0.025em] text-xl font-semibold">{current.title}</h3>
      </div>
      <p className="mb-4 text-[0.9375rem] leading-relaxed text-text-muted">{current.description}</p>

      <div className="mb-3 flex justify-center gap-1.5">
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-4 bg-accent' : 'w-1.5 bg-border-strong'}`} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="button" className="pressable px-1 py-2 text-[0.9375rem] text-text-muted" onClick={onDone}>
          Skip
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <Button type="button" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          <Button type="button" variant="primary" onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}>
            {isLast ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )

  // Defensive fallback - every step's path maps to a real nav item, so
  // in practice a nav element is always found, but if a future step ever
  // doesn't (or measurement races a layout change), fall back to the
  // original fixed-corner placement rather than rendering nothing.
  if (!rect) {
    return (
      <div className="fixed inset-x-4 bottom-24 z-50 flex justify-center">
        {card}
      </div>
    )
  }

  const spotlightStyle = {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
    borderRadius: 14,
    // Comma-separated: the pulse loops forever, the fade-in plays once -
    // see the index.css comment on tour-spotlight-pulse for why both
    // live here inline instead of one being a class.
    animation: 'tour-spotlight-pulse 2s ease-in-out infinite, fade-in 0.2s ease-out',
  }

  return (
    <>
      {/* The dim backdrop + "hole" around the real icon, in one element -
          see the file header comment for how box-shadow does both jobs
          at once without blocking clicks on the rest of the page. */}
      <div key={`spot-${step}`} className="tour-spotlight pointer-events-none fixed z-50" style={spotlightStyle} />

      {below ? (
        <>
          <div
            key={`arrow-${step}`}
            className="pointer-events-none fixed z-50"
            style={{
              top: rect.top + rect.height + PAD + GAP - ARROW,
              left: rect.left + rect.width / 2 - ARROW,
              width: 0,
              height: 0,
              borderLeft: `${ARROW}px solid transparent`,
              borderRight: `${ARROW}px solid transparent`,
              borderBottom: `${ARROW}px solid var(--sb-bg-card)`,
              animation: 'fade-in 0.2s ease-out',
            }}
          />
          <div
            className="fixed inset-x-4 z-50 flex justify-center"
            style={{ top: rect.top + rect.height + PAD + GAP }}
          >
            {card}
          </div>
        </>
      ) : (
        <>
          <div
            key={`arrow-${step}`}
            className="pointer-events-none fixed z-50"
            style={{
              top: rect.top - PAD - GAP,
              left: rect.left + rect.width / 2 - ARROW,
              width: 0,
              height: 0,
              borderLeft: `${ARROW}px solid transparent`,
              borderRight: `${ARROW}px solid transparent`,
              borderTop: `${ARROW}px solid var(--sb-bg-card)`,
              animation: 'fade-in 0.2s ease-out',
            }}
          />
          <div
            className="fixed inset-x-4 z-50 flex justify-center"
            style={{ bottom: window.innerHeight - (rect.top - PAD - GAP) }}
          >
            {card}
          </div>
        </>
      )}
    </>
  )
}
