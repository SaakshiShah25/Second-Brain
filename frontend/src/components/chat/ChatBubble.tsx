import { useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import { ListChecks, NotebookText } from 'lucide-react'
import type { AnswerSource, ChatMessage } from '../../api/types'
import { friendlyDate } from '../../lib/dates'
import CopyButton from '../CopyButton'

const SOURCE_ICON = { note: NotebookText, task: ListChecks }

// Where a tap on a source chip goes: the Today tab for a task, Notes for a note.
function sourceTarget(s: AnswerSource): string {
  return s.kind === 'task' ? '/digest' : '/notes'
}

function Sources({ sources }: { sources: AnswerSource[] }) {
  const navigate = useNavigate()
  return (
    <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
      {sources.map((s) => {
        const Icon = SOURCE_ICON[s.kind] ?? NotebookText
        const label = s.title.replace(/^(Note|Task|Follow-up) · /, '')
        return (
          <button
            key={s.ref}
            type="button"
            onClick={() => navigate(sourceTarget(s))}
            className="pressable flex h-8 max-w-56 flex-shrink-0 items-center gap-1.5 rounded-full border border-border bg-bg-card px-2.5 text-xs text-text-muted"
          >
            <Icon size={13} strokeWidth={2} className="flex-shrink-0" />
            <span className="truncate">
              {s.kind === 'note' && s.date ? `${friendlyDate(s.date)} · ` : ''}
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function ChatBubble({ message }: { message: ChatMessage }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  if (message.role === 'user') {
    // No copy button on your own message - same as every mainstream chat
    // UI; you already have what you typed.
    return (
      <div className="flex justify-end" style={{ animation: 'fade-in 0.2s ease-out' }}>
        <div className="prose-chat max-w-[85%] rounded-[1.25rem] rounded-br-md bg-bg-hover px-4 py-2.5 text-[0.9375rem] leading-relaxed text-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      </div>
    )
  }

  // Assistant replies are open text on the page, not a bubble - the way
  // the ChatGPT/Claude mobile apps render them - followed by the sources
  // the answer relied on.
  return (
    <div className="pr-2" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <div ref={bodyRef} className="prose-chat text-[0.9375rem] leading-relaxed text-text">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
      {message.sources && message.sources.length > 0 && <Sources sources={message.sources} />}
      {!message.status && (
        <div className="-ml-1.5 mt-1">
          <CopyButton text={message.content} source={bodyRef} />
        </div>
      )}
    </div>
  )
}
