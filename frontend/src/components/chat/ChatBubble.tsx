import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../../api/types'
import ConfiaLogo from '../ConfiaLogo'
import CopyButton from '../CopyButton'
import SpeakButton from '../SpeakButton'

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
