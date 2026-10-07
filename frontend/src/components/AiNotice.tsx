import { Sparkles } from 'lucide-react'

// One consistent "this was written by AI" label, shown under every piece
// of AI-generated text (chat answers, saved-note summaries, briefings,
// the morning brief). Generated text can be wrong or incomplete, and the
// reader should never have to guess which parts of the app are AI - this
// is also what Google Play's AI-content policy expects to see.
export default function AiNotice({ children }: { children?: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1 text-[11px] leading-snug text-text-faint">
      <Sparkles size={11} strokeWidth={1.8} className="flex-shrink-0" />
      <span>AI-generated and may be inaccurate. {children}</span>
    </p>
  )
}
