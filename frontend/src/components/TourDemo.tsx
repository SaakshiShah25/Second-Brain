import { useEffect, useState, type ReactNode } from 'react'
import { Bell, Briefcase, CircleHelp, Home, Lock, NotebookText, Plane, Smile, TriangleAlert, type LucideIcon } from 'lucide-react'

// The animated examples in the tour: a sample note being typed and what the app makes of it, a sample question and its
// answer, and a picture of what each of the other tabs looks like. Pure illustration - scripted, no API calls, nothing
// is saved - so it costs nothing and can't leave test notes in anyone's account.

export type DemoKind = 'log' | 'ask' | 'today' | 'spaces' | 'settings'

// One story runs through every step: a note about Priya and a trip, then the question, the to-dos it made, the spaces.
const NOTE = 'Met Priya from Acme. She wants the revised proposal by Friday and her budget is capped at ₹5 lakh. Also book flights for the Mumbai trip tomorrow morning.'
const QUESTION = 'What is Priya’s budget?'
const ANSWER = 'Priya’s budget is capped at ₹5 lakh, and she wants the revised proposal by Friday.'
const SOURCE = 'Met Priya from Acme'

const WORK = '#3477c9'
const TRAVEL = '#1f9bb0'
const FAMILY = '#c93b8f'

const TYPE_MS = 18 // per character
const THINK_MS = 900

type Phase = 'typing' | 'thinking' | 'done'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// One coloured section of the reply, like the real one: the space's name, its key points, its to-dos.
function Section({ color, Icon, name, points = [], tasks }: { color: string; Icon: LucideIcon; name: string; points?: string[]; tasks: { text: string; when: string }[] }) {
  return (
    <div className="border-l-[3px] pl-3" style={{ borderColor: color }}>
      <p className="flex items-center gap-1.5 text-[0.8125rem] font-bold" style={{ color }}>
        <Icon size={14} strokeWidth={2.2} /> Space: {name}
      </p>
      {points.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2 text-[0.8125rem] leading-snug">
              <span className="mt-[0.4rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-faint" />
              {p}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[0.8125rem] font-bold" style={{ color }}>
        To-dos
      </p>
      <ul className="mt-1 flex flex-col gap-1.5">
        {tasks.map((t) => (
          <li key={t.text} className="flex items-center gap-2 text-[0.8125rem] leading-snug">
            <span className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-text-faint" />
            <span className="min-w-0 flex-1">{t.text}</span>
            <span className="flex-shrink-0 text-text-muted">{t.when}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Row({ ring, children, sub, subTone = 'muted', bell = false }: { ring?: string; children: ReactNode; sub: string; subTone?: 'muted' | 'danger' | 'accent'; bell?: boolean }) {
  const tone = subTone === 'danger' ? 'text-danger font-medium' : subTone === 'accent' ? 'text-accent' : 'text-text-muted'
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5">
      <span className="mt-0.5 h-[1.125rem] w-[1.125rem] flex-shrink-0 rounded-full border-2" style={{ borderColor: ring ?? 'var(--sb-text-faint)' }} />
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] leading-snug">{children}</span>
        <span className={`flex items-center gap-1 text-[0.75rem] ${tone}`}>
          {subTone === 'danger' && <TriangleAlert size={11} strokeWidth={2.2} />}
          {sub}
        </span>
      </span>
      {bell && <Bell size={15} strokeWidth={1.9} className="mt-0.5 flex-shrink-0 text-accent" fill="currentColor" />}
    </div>
  )
}

function Heading({ children, tone }: { children: string; tone?: 'danger' }) {
  return <p className={`mb-1 mt-2.5 px-1 text-[0.6875rem] font-semibold uppercase tracking-wide first:mt-0 ${tone === 'danger' ? 'text-danger' : 'text-text-faint'}`}>{children}</p>
}

function TodayMock() {
  return (
    <div>
      <div className="mb-2.5 flex gap-1.5">
        {['Today 3', 'Upcoming 2', 'Anytime 4'].map((t, i) => (
          <span key={t} className={`rounded-full px-3 py-1 text-[0.75rem] font-medium ${i === 0 ? 'bg-accent text-accent-contrast' : 'border border-border-strong bg-bg-card text-text-muted'}`}>
            {t}
          </span>
        ))}
      </div>
      <Heading tone="danger">Overdue · 1</Heading>
      <div className="overflow-hidden rounded-xl border border-border bg-bg-card">
        <Row sub="Yesterday" subTone="danger">Pay the electricity bill</Row>
      </div>
      <Heading>Today · 2</Heading>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-card">
        <Row sub="Today, 9:00 AM" bell>Book flights for the Mumbai trip</Row>
        <Row sub="Today, 5:00 PM">Call the plumber about the tap</Row>
      </div>
      <Heading>High priority · 1</Heading>
      <div className="overflow-hidden rounded-xl border border-border bg-bg-card">
        <Row ring="#d6336c" sub="Friday">Send Priya the revised proposal</Row>
      </div>
    </div>
  )
}

function SpacesMock() {
  const spaces: { name: string; Icon: LucideIcon; color: string; line: string; point?: string }[] = [
    { name: 'Work', Icon: Briefcase, color: WORK, line: '3 notes · 5 to-dos', point: 'Priya’s budget is capped at ₹5 lakh' },
    { name: 'Travel', Icon: Plane, color: TRAVEL, line: '1 note · 2 to-dos' },
    { name: 'Family', Icon: Home, color: FAMILY, line: '2 notes · 1 to-do' },
  ]
  return (
    <div className="flex flex-col gap-2">
      {spaces.map(({ name, Icon, color, line, point }) => (
        <div key={name} className="rounded-xl border border-border bg-bg-card px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}22`, color }}>
              <Icon size={16} strokeWidth={2.1} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.875rem] font-semibold">{name}</span>
              <span className="block text-[0.75rem] text-text-muted">{line}</span>
            </span>
          </div>
          {point && (
            <p className="mt-1.5 flex gap-2 pl-0.5 text-[0.8125rem] leading-snug">
              <span className="mt-[0.4rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-faint" />
              {point}
            </p>
          )}
        </div>
      ))}
      <p className="px-1 text-[0.75rem] text-text-muted">Tap a space: its Notes, To-dos and Lists are three pages you swipe between.</p>
    </div>
  )
}

function SettingsMock() {
  const rows: { Icon: LucideIcon; label: string; detail: string }[] = [
    { Icon: Bell, label: 'Reminders', detail: 'Morning and evening summary, alarms' },
    { Icon: Lock, label: 'App lock', detail: 'PIN or fingerprint' },
    { Icon: CircleHelp, label: 'Help & FAQ', detail: 'Answers to common questions' },
    { Icon: Smile, label: 'Send feedback', detail: 'Rate the app or report a problem' },
  ]
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-card">
      {rows.map(({ Icon, label, detail }) => (
        <div key={label} className="flex items-center gap-2.5 px-3 py-2.5">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-text-muted">
            <Icon size={15} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8125rem] font-medium">{label}</span>
            <span className="block text-[0.75rem] text-text-muted">{detail}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

// The typed-then-answered chat (Log / Ask).
function ChatDemo({ kind }: { kind: 'log' | 'ask' }) {
  const typed = kind === 'log' ? NOTE : QUESTION
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
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <div className="max-w-[90%] rounded-[1.1rem] rounded-br-md bg-bg-hover px-3.5 py-2 text-[0.875rem] leading-snug text-text">
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
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg-card px-3 py-3" style={{ animation: 'fade-in 0.3s ease-out' }}>
          <Section color={WORK} Icon={Briefcase} name="Work" points={['Priya (Acme) wants the revised proposal', 'Her budget is capped at ₹5 lakh']} tasks={[{ text: 'Send Priya the revised proposal', when: 'Friday' }]} />
          <Section color={TRAVEL} Icon={Plane} name="Travel" tasks={[{ text: 'Book flights for the Mumbai trip', when: 'Tomorrow, 9:00 AM' }]} />
        </div>
      )}

      {phase === 'done' && kind === 'ask' && (
        <div style={{ animation: 'fade-in 0.3s ease-out' }}>
          <p className="px-1 text-[0.875rem] leading-snug text-text">{ANSWER}</p>
          <span className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-bg-card px-2.5 text-xs text-text-muted">
            <NotebookText size={13} strokeWidth={2} />
            {SOURCE}
          </span>
        </div>
      )}
    </div>
  )
}

export default function TourDemo({ kind }: { kind: DemoKind }) {
  return (
    <div className="mb-4 rounded-2xl bg-bg-elevated p-3" aria-label="Example" role="img">
      {kind === 'log' || kind === 'ask' ? <ChatDemo kind={kind} /> : kind === 'today' ? <TodayMock /> : kind === 'spaces' ? <SpacesMock /> : <SettingsMock />}
    </div>
  )
}
