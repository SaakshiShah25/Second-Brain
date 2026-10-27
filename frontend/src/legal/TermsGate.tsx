import { useState, type ReactNode } from 'react'
import { FileText, Lock, ShieldOff, Trash2, TriangleAlert, UserCheck } from 'lucide-react'
import { useAcceptTerms, useSettings } from '../api/settings'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/Button'
import Sheet from '../components/Sheet'
import LoadingScreen from '../components/LoadingScreen'
import TermsTextModal from './TermsTextModal'

// Gates the authenticated app behind a Terms of Service acceptance,
// mounted around the same route tree as ChatSessionProvider (see
// App.tsx). Acceptance is stored server-side (user_preference.
// terms_accepted_at - see api/routers/settings.py) rather than just
// localStorage, so it follows the account across the web app and the
// Android app rather than needing to be re-accepted on each.
//
// This used to force-scroll the full 12-section legal text before "I
// Agree" would even enable - genuinely long to read at signup, and not
// how most consumer apps handle this (Slack, GitHub, Discord etc. all
// show a short plain-language summary plus a link to the full document,
// gated by a single checkbox, not a scroll-to-the-bottom requirement).
// The full text hasn't gone anywhere - it's the same TERMS_TEXT, still
// reachable in full at /privacy (also linked below) - this is just a
// faster front door onto it, not a shorter version of what you're
// actually agreeing to.
const SUMMARY_POINTS: { icon: typeof FileText; text: string }[] = [
  { icon: FileText, text: 'Confía logs your notes and contacts, and lets you ask questions about what you\'ve recorded.' },
  { icon: ShieldOff, text: 'What you log is sent to Groq and Cohere to process it, and stored via Supabase - never used to train AI models, sold, or used for advertising.' },
  { icon: TriangleAlert, text: 'Avoid logging highly sensitive info (IDs, passwords, financial details) - it is processed by third-party AI.' },
  { icon: UserCheck, text: 'You own your content. AI-generated answers can be wrong - verify anything important.' },
  { icon: Trash2, text: 'Delete your account and everything in it anytime, from Settings.' },
]

export default function TermsGate({ children }: { children: ReactNode }) {
  const { data: settings, isLoading, isError } = useSettings()
  const { signOut } = useAuth()
  const acceptTerms = useAcceptTerms()
  const [checked, setChecked] = useState(false)
  const [showFullText, setShowFullText] = useState(false)

  if (isLoading) {
    return <LoadingScreen />
  }

  // A transient network error shouldn't permanently lock someone out of
  // an app they may have already accepted the terms for - fail open
  // rather than trap them on a blocked screen with no way forward.
  if (isError || !settings || settings.terms_accepted_at) {
    return <>{children}</>
  }

  return (
    <Sheet tall>
      <h1 className="flex items-center gap-2 font-display text-[1.625rem] font-semibold tracking-[-0.025em]">
        <Lock size={20} strokeWidth={2} className="text-brand-ink" />
        Before you start
      </h1>
      <p className="mt-1 mb-5 text-[0.9375rem] text-text-muted">The short version — the full Terms &amp; Privacy Policy are one tap away.</p>
      <ul className="flex flex-col gap-3.5">
        {SUMMARY_POINTS.map(({ icon: Icon, text }, i) => (
          <li key={i} className="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-text">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon size={16} strokeWidth={2} />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl bg-bg-elevated p-3.5 text-[0.9375rem] text-text-muted">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-5 w-5 flex-shrink-0 accent-[var(--sb-accent)]"
        />
        <span>
          I've read and agree to the full{' '}
          <button type="button" onClick={() => setShowFullText(true)} className="font-medium text-link underline">
            Terms of Service &amp; Privacy Policy
          </button>
        </span>
      </label>
      <div className="mt-5 flex flex-col gap-2">
        <Button
          type="button"
          variant="primary"
          size="lg"
          block
          disabled={!checked || acceptTerms.isPending}
          onClick={() => acceptTerms.mutate()}
        >
          {acceptTerms.isPending ? 'Saving…' : 'I agree'}
        </Button>
        <Button type="button" variant="ghost" size="lg" block onClick={() => signOut()}>
          Decline &amp; sign out
        </Button>
      </div>
      {showFullText && <TermsTextModal onClose={() => setShowFullText(false)} />}
    </Sheet>
  )
}
