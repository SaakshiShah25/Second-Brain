import { IdCard, MessageCircleQuestion, PenLine, type LucideIcon } from 'lucide-react'
import type { ChatMode } from '../../api/types'

const copy: Record<ChatMode, { title: string; hint: string; icon: LucideIcon }> = {
  capture: {
    title: 'Log a note',
    hint: "Tell me about someone you just talked to — who they are, what you discussed, how it went.",
    icon: PenLine,
  },
  ask: {
    title: 'Ask a question',
    hint: "Ask about a past conversation, a person, or a follow-up — I'll answer from what you've logged.",
    icon: MessageCircleQuestion,
  },
  card: {
    title: 'Scan a card',
    hint: "Snap a business card and I'll pull out their name, role, company, and contact details.",
    icon: IdCard,
  },
}

export default function EmptyState({ mode }: { mode: ChatMode }) {
  const { title, hint, icon: Icon } = copy[mode]
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon size={22} strokeWidth={2} />
      </div>
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="max-w-xs text-sm text-text-muted">{hint}</p>
    </div>
  )
}
