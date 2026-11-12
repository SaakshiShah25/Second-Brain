import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useSendFeedback } from '../api/feedback'
import { showError } from '../lib/errorDialog'
import { feedbackContext, screenName } from '../lib/feedbackContext'
import Button from './Button'
import { Textarea } from './fields'
import Sheet from './Sheet'

const CATEGORIES: { tag: string; label: string }[] = [
  { tag: 'wrong_answer', label: 'Wrong or odd answer' },
  { tag: 'wrong_space', label: 'Filed in the wrong place' },
  { tag: 'broke', label: 'Something broke' },
  { tag: 'slow', label: 'Slow or stuck' },
  { tag: 'idea', label: 'Idea or request' },
  { tag: 'other', label: 'Something else' },
]

// "Report a problem": a category, what happened, and (only if they tick it) the reply being reported - the app never
// attaches note text on its own. `about` names the reply when opened from under one ("an answer", "a saved note").
export default function ReportSheet({
  onClose,
  about,
  reply,
  initialTag,
}: {
  onClose: () => void
  about?: string
  reply?: string
  initialTag?: string
}) {
  const [tag, setTag] = useState<string | null>(initialTag ?? null)
  const [message, setMessage] = useState('')
  const [include, setInclude] = useState(false)
  const [sent, setSent] = useState(false)
  const send = useSendFeedback()
  const { pathname } = useLocation()

  async function submit() {
    if (!message.trim()) return
    try {
      await send.mutateAsync({
        kind: 'issue',
        tags: tag ? [tag] : [],
        message: message.trim(),
        screen: screenName(pathname),
        context: { ...feedbackContext(), about, included: include && reply ? reply.slice(0, 2000) : undefined },
      })
      setSent(true)
      setTimeout(onClose, 1500)
    } catch (err) {
      showError(err)
    }
  }

  if (sent) {
    return (
      <Sheet onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Check size={24} strokeWidth={2.4} />
          </span>
          <p className="text-lg font-semibold">Thanks - we’ve got it</p>
          <p className="text-[0.9375rem] text-text-muted">We read every report.</p>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={onClose} title="Report a problem">
      {about && <p className="mt-1 text-[0.875rem] text-text-muted">About {about}.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const on = tag === c.tag
          return (
            <button
              key={c.tag}
              type="button"
              aria-pressed={on}
              onClick={() => setTag(on ? null : c.tag)}
              className={`pressable h-9 rounded-full border px-3.5 text-sm ${on ? 'border-accent bg-accent-soft text-accent' : 'border-border-strong bg-bg-card text-text'}`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      <Textarea
        className="mt-4"
        rows={4}
        maxLength={1500}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What happened, and what did you expect?"
      />
      <p className="mt-1.5 text-[0.75rem] text-text-faint">Please don’t include private details from your notes.</p>

      {reply && (
        <label className="mt-3 flex items-start gap-2.5 text-[0.875rem] text-text-muted">
          <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--sb-accent)]" />
          <span>Include this reply so you can look into it. It may contain text from your notes.</span>
        </label>
      )}

      <Button variant="primary" block className="mt-4" onClick={submit} disabled={send.isPending || !message.trim()}>
        {send.isPending ? 'Sending…' : 'Send report'}
      </Button>
    </Sheet>
  )
}
