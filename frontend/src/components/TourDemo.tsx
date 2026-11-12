import { useEffect, useState } from 'react'
import { NotebookText } from 'lucide-react'
import type { UsageMode } from '../api/types'

// The two animated examples in the tour: a sample note being typed and what the app does with it, then a sample
// question and its answer. Pure illustration - scripted, no API calls, nothing is saved - so it costs nothing and
// can't leave test notes in anyone's account. The examples follow what the account is used for.

export type DemoKind = 'log' | 'ask'

interface Sample {
  note: string
  space: string
  points: string[]
  tasks: { text: string; when: string }[]
  question: string
  answer: string
  source: string
}

const SAMPLES: Record<UsageMode, Sample> = {
  work: {
    note: 'Call with Rohan at Acme. He’s unsure about our pricing and will get back next week. Send him the pricing comparison by Friday 5pm.',
    space: 'Clients',
    points: ['Rohan (Acme) is unsure about the pricing', 'He’ll reply next week'],
    tasks: [{ text: 'Send Rohan the pricing comparison', when: 'Fri, 5:00 PM' }],
    question: 'What did Rohan say about pricing?',
    answer: 'He’s unsure about the pricing and will get back to you next week. You still owe him the comparison by Friday 5 PM.',
    source: 'Call with Rohan at Acme',
  },
  personal: {
    note: 'Mum’s birthday dinner is on the 20th. Book a table for 6 and buy her a gift.',
    space: 'Family',
    points: ['Mum’s birthday dinner is on the 20th'],
    tasks: [
      { text: 'Book a table for 6', when: 'Anytime' },
      { text: 'Buy Mum a gift', when: 'Anytime' },
    ],
    question: 'When is Mum’s birthday dinner?',
    answer: 'On the 20th. You still need to book a table for 6 and buy her a gift.',
    source: 'Mum’s birthday dinner',
  },
  both: {
    note: 'Call the plumber tomorrow at 5pm about the leaking tap. Priya says the offsite is moving to March.',
    space: 'Home · Work',
    points: ['The offsite is moving to March (Priya)'],
    tasks: [{ text: 'Call the plumber about the leaking tap', when: 'Tomorrow, 5:00 PM' }],
    question: 'When is the offsite?',
    answer: 'It’s moving to March, according to Priya.',
    source: 'Offsite moving to March',
  },
}

const TYPE_MS = 24 // per character
const THINK_MS = 900

type Phase = 'typing' | 'thinking' | 'done'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export default function TourDemo({ kind, mode }: { kind: DemoKind; mode: UsageMode }) {
  const sample = SAMPLES[mode]
  const typed = kind === 'log' ? sample.note : sample.question
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? typed.length : 0))
  const [phase, setPhase] = useState<Phase>(() => (prefersReducedMotion() ? 'done' : 'typing'))

  useEffect(() => {
    if (phase !== 'typing') return
    if (shown >= typed.length) {
      const t = setTimeout(() => setPhase('thinking'), 350)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setShown((n) => n + 1), TYPE_MS)
    return () => clearTimeout(t)
  }, [phase, shown, typed.length])

  useEffect(() => {
    if (phase !== 'thinking') return
    const t = setTimeout(() => setPhase('done'), THINK_MS)
    return () => clearTimeout(t)
  }, [phase])

  return (
    <div className="mb-4 flex min-h-[15rem] flex-col gap-3 rounded-2xl bg-bg-elevated p-3" aria-label="Example" role="img">
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-[1.1rem] rounded-br-md bg-bg-hover px-3.5 py-2 text-[0.875rem] leading-snug text-text">
          {typed.slice(0, shown)}
          {phase === 'typing' && <span className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-text-muted" style={{ animation: 'pulse-rec 1s infinite' }} />}
        </div>
      </div>

      {phase === 'thinking' && (
        <div className="flex gap-1 px-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-text-faint" style={{ animation: `typing-bounce 1s ease-in-out ${i * 0.15}s infinite` }} />
          ))}
        </div>
      )}

      {phase === 'done' && kind === 'log' && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg-card px-3.5 py-3 text-[0.8125rem] leading-snug" style={{ animation: 'fade-in 0.3s ease-out' }}>
          <p className="font-semibold text-accent">Space: {sample.space}</p>
          <ul className="flex flex-col gap-1">
            {sample.points.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-[0.4rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-faint" />
                {p}
              </li>
            ))}
          </ul>
          <p className="font-semibold text-accent">Tasks</p>
          <ul className="flex flex-col gap-1.5">
            {sample.tasks.map((t) => (
              <li key={t.text} className="flex items-center gap-2">
                <span className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-text-faint" />
                <span className="min-w-0 flex-1">{t.text}</span>
                <span className="flex-shrink-0 text-text-muted">{t.when}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {phase === 'done' && kind === 'ask' && (
        <div style={{ animation: 'fade-in 0.3s ease-out' }}>
          <p className="px-1 text-[0.875rem] leading-snug text-text">{sample.answer}</p>
          <span className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-bg-card px-2.5 text-xs text-text-muted">
            <NotebookText size={13} strokeWidth={2} />
            {sample.source}
          </span>
        </div>
      )}
    </div>
  )
}
