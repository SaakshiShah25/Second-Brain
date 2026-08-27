import { Brain } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../../api/types'
import CopyButton from '../CopyButton'
import SpeakButton from '../SpeakButton'

export default function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="relative max-w-[80%] rounded-2xl bg-accent-soft py-2.5 pl-4 pr-9 text-sm text-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          <div className="absolute right-1.5 top-1.5">
            <CopyButton text={message.content} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Brain size={15} strokeWidth={2} />
      </div>
      <div className="relative min-w-0 flex-1 pr-8 pt-1">
        <div className="prose-chat text-sm leading-relaxed text-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
        <div className="mt-1.5">
          <SpeakButton text={message.content} />
        </div>
        <div className="absolute right-0 top-0.5">
          <CopyButton text={message.content} />
        </div>
      </div>
    </div>
  )
}
