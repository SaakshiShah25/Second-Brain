import { useState, type ReactNode, type UIEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAcceptTerms, useSettings } from '../api/settings'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/Button'
import { TERMS_TEXT } from './termsText'

// Gates the authenticated app behind a Terms of Service acceptance,
// mounted around the same route tree as ChatSessionProvider (see
// App.tsx). Acceptance is stored server-side (user_preference.
// terms_accepted_at - see api/routers/settings.py) rather than just
// localStorage, so it follows the account across the web app and the
// Android app rather than needing to be re-accepted on each.
export default function TermsGate({ children }: { children: ReactNode }) {
  const { data: settings, isLoading, isError } = useSettings()
  const { signOut } = useAuth()
  const acceptTerms = useAcceptTerms()
  const [scrolledToEnd, setScrolledToEnd] = useState(false)

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-bg text-text-muted">Loading…</div>
  }

  // A transient network error shouldn't permanently lock someone out of
  // an app they may have already accepted the terms for - fail open
  // rather than trap them on a blocked screen with no way forward.
  if (isError || !settings || settings.terms_accepted_at) {
    return <>{children}</>
  }

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setScrolledToEnd(true)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <div className="border-b border-border p-4 md:p-6">
        <h1 className="text-xl font-semibold tracking-tight">Terms of Service &amp; Privacy</h1>
        <p className="mt-1 text-sm text-text-muted">Please read and accept to continue.</p>
      </div>
      <div onScroll={handleScroll} className="prose-chat flex-1 overflow-y-auto p-4 text-sm leading-relaxed md:p-6">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{TERMS_TEXT}</ReactMarkdown>
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-border p-4 md:flex-row md:justify-end md:p-6">
        <Button type="button" variant="secondary" onClick={() => signOut()}>
          Decline &amp; sign out
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!scrolledToEnd || acceptTerms.isPending}
          onClick={() => acceptTerms.mutate()}
          title={scrolledToEnd ? undefined : 'Scroll to the bottom to enable'}
        >
          {acceptTerms.isPending ? 'Saving…' : 'I Agree'}
        </Button>
      </div>
    </div>
  )
}
