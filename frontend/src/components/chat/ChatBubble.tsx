import { useState } from 'react'
import { Flag, TriangleAlert } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../../api/types'
import AiNotice from '../AiNotice'
import ConfiaLogo from '../ConfiaLogo'
import CopyButton from '../CopyButton'
import ReportDialog from './ReportDialog'
import SourcesList from './SourcesList'

// `question` is whatever the user sent just before this reply (the
// question asked, or the note logged) - passed in by ChatPage, since a
// bubble only knows its own message. Only needed to give a report enough
// context to be reviewable.
export default function ChatBubble({ message, question = '' }: { message: ChatMessage; question?: string }) {
  const [reportOpen, setReportOpen] = useState(false)
  const [reported, setReported] = useState(false)
  // A problem, not an answer: its own alert styling (tinted box, warning
  // icon, no assistant avatar) so nobody reads "Didn't catch anything" as
  // something MyConfía said back about their note.
  if (message.kind === 'notice') {
    return (
      <div
        role="alert"
        className="flex items-start gap-2.5 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-text"
      >
        <TriangleAlert size={16} strokeWidth={1.8} className="mt-0.5 flex-shrink-0 text-danger" />
        <div className="prose-chat min-w-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      </div>
    )
  }

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
        {/* Only AI-generated messages (answers, saved-note summaries) get
            the notice + Report control - not canned ones like errors,
            "Stopped", or the out-of-scope refusal, where "this may be
            inaccurate" would just be noise. */}
        {message.kind && (
          <>
            {message.sources && message.sources.length > 0 && (
              <SourcesList sources={message.sources} total={message.sourcesTotal} />
            )}
            <div className="mt-2.5 flex items-start justify-between gap-3 border-t border-border pt-2">
              <AiNotice>
                {message.sources && message.sources.length > 0 ? 'Check the sources to verify.' : null}
              </AiNotice>
              {reported ? (
                <span className="flex-shrink-0 text-[11px] text-text-faint">Reported</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="flex flex-shrink-0 items-center gap-1 text-[11px] text-text-faint transition-colors hover:text-danger"
                >
                  <Flag size={11} strokeWidth={1.8} />
                  Report
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {reportOpen && message.kind && (
        <ReportDialog
          kind={message.kind}
          question={question}
          answer={message.content}
          sourceIds={(message.sources ?? []).map((s) => s.id)}
          onClose={() => setReportOpen(false)}
          onSent={() => setReported(true)}
        />
      )}
    </div>
  )
}
