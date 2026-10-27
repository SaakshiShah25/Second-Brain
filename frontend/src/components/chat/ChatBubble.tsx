import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import { FileText, ListChecks, NotebookText, User } from 'lucide-react'
import type { AnswerSource, ChatMessage } from '../../api/types'
import { friendlyDate } from '../../lib/dates'
import CopyButton from '../CopyButton'
import DocumentResultCard from '../documents/DocumentResultCard'

const SOURCE_ICON = { note: NotebookText, task: ListChecks, person: User, document: FileText }

// Where a tap on a source chip goes: the person behind it when there is
// one (their timeline holds the note/task), otherwise the right tab.
function sourceTarget(s: AnswerSource): string {
  if (s.kind === 'person') return `/people/${s.id}`
  if (s.person_id) return `/people/${s.person_id}`
  return s.kind === 'task' ? '/digest' : s.kind === 'document' ? '/documents' : '/notes'
}

function Sources({ sources }: { sources: AnswerSource[] }) {
  const navigate = useNavigate()
  return (
    <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
      {sources.map((s) => {
        const Icon = SOURCE_ICON[s.kind] ?? NotebookText
        const label = s.title.replace(/^(Note|Follow-up|Person|Document) · /, '')
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

export default function ChatBubble({ message, onOption }: { message: ChatMessage; onOption?: (option: string) => void }) {
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

  // A pure file-fetch answer is just the card.
  if (message.documents && !message.sources && message.content.startsWith('Found documents for:')) {
    return (
      <div style={{ animation: 'fade-in 0.2s ease-out' }}>
        <DocumentResultCard result={message.documents} />
      </div>
    )
  }

  // Assistant replies are open text on the page, not a bubble - the way
  // the ChatGPT/Claude mobile apps render them - followed by whatever the
  // answer came with: files found, the sources it relied on, or answer
  // options for a clarifying question.
  return (
    <div className="pr-2" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <div className="prose-chat text-[0.9375rem] leading-relaxed text-text">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
      {message.options && message.options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {message.options.map((o) => (
            <button
              key={o}
              type="button"
              disabled={!onOption}
              onClick={() => onOption?.(o)}
              className="pressable rounded-full border border-border-strong bg-bg-card px-3.5 py-2 text-sm font-medium disabled:opacity-50"
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {message.documents && (
        <div className="mt-3">
          <DocumentResultCard result={message.documents} />
        </div>
      )}
      {message.sources && message.sources.length > 0 && <Sources sources={message.sources} />}
      <div className="-ml-1.5 mt-1">
        <CopyButton text={message.content} />
      </div>
    </div>
  )
}
