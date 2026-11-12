import { useState } from 'react'
import { useSendFeedback } from '../api/feedback'
import FeedbackSheet, { FACES } from './FeedbackSheet'

// The small "How is MyConfía working for you?" card that appears in the chat after a successful save, once the
// person has logged a few notes (api/routers/feedback.py decides when). A face opens the short form; "Not now"
// is remembered for 30 days, account-wide.
export default function RatingCard() {
  const [open, setOpen] = useState<number | null>(null)
  const [hidden, setHidden] = useState(false)
  const send = useSendFeedback()
  if (hidden) return null

  function notNow() {
    setHidden(true)
    send.mutate({ kind: 'snooze' })
  }

  return (
    <>
      <div className="rounded-2xl border border-border bg-bg-card px-4 py-3.5" style={{ animation: 'fade-in 0.25s ease-out' }}>
        <p className="text-[0.9375rem] font-medium">How is MyConfía working for you?</p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {FACES.map((f) => (
              <button
                key={f.rating}
                type="button"
                onClick={() => setOpen(f.rating)}
                aria-label={f.label}
                title={f.label}
                className="pressable flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg text-[1.5rem] leading-none"
              >
                {f.emoji}
              </button>
            ))}
          </div>
          <button type="button" onClick={notNow} className="pressable px-2 py-2 text-sm text-text-muted">
            Not now
          </button>
        </div>
      </div>
      {open !== null && <FeedbackSheet initialRating={open} onClose={() => { setOpen(null); setHidden(true) }} />}
    </>
  )
}
