import { Sparkles } from 'lucide-react'

// One consistent "AI was involved here" label, with wording that matches
// WHAT the AI did - saying "AI-generated" about something it merely read
// out of the user's own note would be inaccurate in the other direction:
//   answer      - the AI wrote this reply from the user's saved notes
//   briefing    - the AI wrote a summary (person/company briefing, morning brief)
//   extraction  - the AI picked structured details (person, summary, tasks,
//                 dates) out of a note the user wrote; the note itself is
//                 saved exactly as typed
// Generated or extracted text can be wrong or incomplete, and the reader
// should never have to guess which parts of the app involve AI - this is
// also what Google Play's AI-content policy expects to see.
type Kind = 'answer' | 'briefing' | 'extraction'

const TEXT: Record<Kind, string> = {
  answer: 'AI-generated and may be inaccurate.',
  briefing: 'AI-written summary of your notes - may be inaccurate.',
  extraction: 'Details were picked out of your note by AI and may be incomplete or wrong. Your note is saved exactly as you wrote it.',
}

export default function AiNotice({ kind = 'answer', children }: { kind?: Kind; children?: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1 text-[11px] leading-snug text-text-faint">
      <Sparkles size={11} strokeWidth={1.8} className="mt-px flex-shrink-0" />
      <span>
        {TEXT[kind]} {children}
      </span>
    </p>
  )
}
