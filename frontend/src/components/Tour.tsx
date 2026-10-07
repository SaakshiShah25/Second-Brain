import { useCallback, useLayoutEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ListTree,
  MessageCircleQuestion,
  MessageSquare,
  NotebookText,
  Settings as SettingsIcon,
  Sunrise,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { ASK_EXAMPLES, LOG_EXAMPLES } from '../lib/examples'
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
  // A concrete sample of what to type on this step - the quickest way to
  // understand what "log a note" or "ask a question" actually means. Plain
  // text, not seeded data: nothing is added to the user's real account.
  example?: string
}

const STEPS: Step[] = [
  {
    icon: MessageSquare,
    title: 'Log anything',
    description: 'Type or speak a note about anyone or anything — the AI figures out who it’s about and what to remember.',
    path: '/',
    example: LOG_EXAMPLES[0],
  },
  {
    icon: MessageCircleQuestion,
    title: 'Ask anything',
    description: 'The same chat window doubles as search — ask about a person, a topic, or a time period, and it answers from your own notes and shows which ones.',
    path: '/',
    example: ASK_EXAMPLES[1],
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
  // Desktop's nav is a left sidebar (card anchors to its right, arrow
  // points left); mobile's is a bottom bar (card anchors above it, arrow
  // points down) - matches Layout.tsx's own md: breakpoint exactly, not
  // a separate guess at it.
  const [desktop, setDesktop] = useState(false)
  const navigate = useNavigate()
  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1
  const basePath = current.path.split('?')[0]

  // Finds the real, currently-VISIBLE nav element for this step (Layout
  // renders both the desktop sidebar and mobile bottom nav at all times,
  // one of them display:none'd by CSS rather than unmounted - the hidden
  // one's own getBoundingClientRect is all zeros, which is exactly how
  // this tells the two apart without needing to know which layout is
  // active any other way).
  const measure = useCallback(() => {
    const els = document.querySelectorAll<HTMLElement>(`[data-tour-nav="${basePath}"]`)
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.width > 0) {
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        setDesktop(window.matchMedia('(min-width: 768px)').matches)
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
      className="w-full max-w-sm rounded-xl border border-border-strong bg-bg-elevated p-5 shadow-lg"
      style={{ animation: 'tour-card-in 0.25s ease-out' }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon size={18} strokeWidth={1.6} />
        </span>
        <h3 className="text-base font-semibold">{current.title}</h3>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-text-muted">{current.description}</p>
      {current.example && (
        <p className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-text">
          <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-text-faint">
            Try typing
          </span>
          “{current.example}”
        </p>
      )}
      {!current.example && <div className="mb-1" />}

      <div className="mb-3 flex justify-center gap-1.5">
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-accent' : 'bg-border-strong'}`} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="button" className="text-sm text-text-faint hover:text-text-muted" onClick={onDone}>
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
      <div className="fixed inset-x-4 bottom-20 z-50 flex justify-center md:inset-x-auto md:bottom-6 md:left-6 md:justify-start">
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

      {desktop ? (
        <>
          <div
            key={`arrow-${step}`}
            className="pointer-events-none fixed z-50"
            style={{
              top: rect.top + rect.height / 2 - ARROW,
              left: rect.left + rect.width + PAD + GAP,
              width: 0,
              height: 0,
              borderTop: `${ARROW}px solid transparent`,
              borderBottom: `${ARROW}px solid transparent`,
              borderRight: `${ARROW}px solid var(--sb-bg-elevated)`,
              animation: 'fade-in 0.2s ease-out',
            }}
          />
          <div
            className="fixed z-50"
            style={{ top: rect.top + rect.height / 2, left: rect.left + rect.width + PAD + GAP + ARROW, transform: 'translateY(-50%)' }}
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
              top: rect.top - PAD - GAP - ARROW,
              left: rect.left + rect.width / 2 - ARROW,
              width: 0,
              height: 0,
              borderLeft: `${ARROW}px solid transparent`,
              borderRight: `${ARROW}px solid transparent`,
              borderTop: `${ARROW}px solid var(--sb-bg-elevated)`,
              animation: 'fade-in 0.2s ease-out',
            }}
          />
          <div
            className="fixed inset-x-4 z-50 flex justify-center"
            style={{ bottom: window.innerHeight - (rect.top - PAD - GAP - ARROW) }}
          >
            {card}
          </div>
        </>
      )}
    </>
  )
}
