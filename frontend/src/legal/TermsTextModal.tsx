import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Button from '../components/Button'
import Sheet from '../components/Sheet'
import { TERMS_TEXT } from './termsText'

// In-app dialog for the full Terms/Privacy text, used wherever a "Terms
// of Service & Privacy Policy" link is shown inside the app (TermsGate).
// Keeps the user on the same screen instead of navigating to a new tab -
// the public, no-login /privacy page (PublicPrivacyPage.tsx) still exists
// separately for the Play Store listing requirement.
export default function TermsTextModal({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} title="Terms of Service & Privacy" tall zIndex={60}>
      <div className="prose-chat text-[0.9375rem] leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{TERMS_TEXT}</ReactMarkdown>
      </div>
      <Button type="button" variant="primary" size="lg" block className="mt-6" onClick={onClose}>
        Close
      </Button>
    </Sheet>
  )
}
