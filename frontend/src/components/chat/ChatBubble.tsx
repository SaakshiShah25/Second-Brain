import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../../api/types'
import ConfiaLogo from '../ConfiaLogo'
import CopyButton from '../CopyButton'

export default function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    // No copy button here - deliberately. Every mainstream chat UI
    // (ChatGPT, Claude, Gemini) only puts a copy affordance on the
    // ASSISTANT's reply, never on your own sent message - you already
    // have whatever you just typed, so there's nothing to copy back.
    // Both bubbles showing the identical icon in the same corner was
    // exactly what made it easy to click the wrong one; removing this
    // one instead of trying to visually distinguish two copy buttons.
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-accent-soft px-4 py-2.5 text-sm text-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-text">
        <ConfiaLogo size={15} />
      </div>
      {/* A real bounding box, not bare text on the page background - the
          copy button below is positioned relative to THIS box, so it
          needs a visible edge to read as "attached to this response"
          rather than floating in empty space next to unbounded text. */}
      <div className="relative min-w-0 flex-1 rounded-2xl bg-bg-card py-2.5 pl-4 pr-10">
        <div className="prose-chat text-sm leading-relaxed text-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
        <div className="absolute right-2.5 top-2.5">
          <CopyButton text={message.content} />
        </div>
      </div>
    </div>
  )
}
