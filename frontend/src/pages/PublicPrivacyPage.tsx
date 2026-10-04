import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import { TERMS_TEXT } from '../legal/termsText'

// Public, no-login rendering of the same Terms/Privacy text shown inside
// TermsGate.tsx - Google Play Console's store listing requires a privacy
// policy URL that's reachable WITHOUT signing in, which the in-app-only
// TermsGate obviously isn't. Single source of truth stays termsText.ts;
// this page is just an unauthenticated window onto it, not a fork.
export default function PublicPrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-text">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Terms of Service &amp; Privacy</h1>
      <div className="prose-chat mt-6 text-sm leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{TERMS_TEXT}</ReactMarkdown>
      </div>
      <Link to="/login" className="mt-8 inline-block text-sm text-accent underline">
        Back to MyConfía
      </Link>
    </div>
  )
}
