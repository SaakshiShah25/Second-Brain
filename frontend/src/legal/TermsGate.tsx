import { useState, type ReactNode } from 'react'
import { FileText, Lock, ShieldOff, Trash2, TriangleAlert, UserCheck } from 'lucide-react'
import { useAcceptTerms, useSettings } from '../api/settings'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/Button'
import LoadingScreen from '../components/LoadingScreen'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border-strong bg-bg-elevated">
        <div className="border-b border-border p-4">
          <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Lock size={16} strokeWidth={1.6} className="text-accent" />
            Before you start
          </h1>
          <p className="mt-0.5 text-xs text-text-muted">The short version - the full Terms & Privacy Policy are one tap away.</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <ul className="flex flex-col gap-3">
            {SUMMARY_POINTS.map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-text">
                <Icon size={16} strokeWidth={1.6} className="mt-0.5 flex-shrink-0 text-accent" />
                {text}
              </li>
            ))}
          </ul>
          <label className="mt-5 flex cursor-pointer items-start gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent"
            />
            I've read and agree to the full{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-accent underline">
              Terms of Service &amp; Privacy Policy
            </a>
          </label>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => signOut()}>
            Decline &amp; sign out
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!checked || acceptTerms.isPending}
            onClick={() => acceptTerms.mutate()}
          >
            {acceptTerms.isPending ? 'Saving…' : 'I Agree'}
          </Button>
        </div>
      </div>
    </div>
  )
}
