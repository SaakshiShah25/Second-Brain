import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X } from 'lucide-react'
import Button from '../components/Button'
import { TERMS_TEXT } from './termsText'

// In-app dialog for the full Terms/Privacy text, used wherever a "Terms
// of Service & Privacy Policy" link is shown inside the app (TermsGate).
// Keeps the user on the same screen instead of navigating to a new tab -
// the public, no-login /privacy page (PublicPrivacyPage.tsx) still exists
// separately for the Play Store listing requirement.
export default function TermsTextModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border-strong bg-bg-elevated">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-base font-semibold tracking-tight">Terms of Service &amp; Privacy</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-text-muted hover:text-text"
          >
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>
        <div className="prose-chat flex-1 overflow-y-auto p-4 text-sm leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{TERMS_TEXT}</ReactMarkdown>
        </div>
        <div className="flex justify-end border-t border-border p-4">
          <Button type="button" variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
