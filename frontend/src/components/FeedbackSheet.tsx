import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useSendFeedback } from '../api/feedback'
import { showError } from '../lib/errorDialog'
import { feedbackContext, screenName } from '../lib/feedbackContext'
import Button from './Button'
import { Textarea } from './fields'
import Sheet from './Sheet'

export const FACES: { rating: number; emoji: string; label: string }[] = [
  { rating: 4, emoji: '😍', label: 'Loving it' },
  { rating: 3, emoji: '🙂', label: 'Good' },
  { rating: 2, emoji: '😐', label: 'Okay' },
  { rating: 1, emoji: '🙁', label: 'Poor' },
]

const REASONS: { tag: string; label: string }[] = [
  { tag: 'wrong_answers', label: 'Wrong answers' },
  { tag: 'slow', label: 'Slow' },
  { tag: 'confusing', label: 'Confusing' },
  { tag: 'missing_feature', label: 'Missing something' },
  { tag: 'other', label: 'Something else' },
]

// "How is MyConfía working for you?" - four faces; a lower score also asks what got in the way (tap, no typing
// needed), and there is an optional note. Opened from the rating card in the chat and from Settings.
export default function FeedbackSheet({ initialRating, onClose }: { initialRating?: number; onClose: () => void }) {
  const [rating, setRating] = useState<number | null>(initialRating ?? null)
  const [tags, setTags] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const send = useSendFeedback()
  const { pathname } = useLocation()

  // Picking "Something else" without saying what is no use to anyone: the words are required then.
  const needsWords = rating !== null && rating <= 2 && tags.includes('other') && !message.trim()

  async function submit() {
    if (rating === null || needsWords) return
    try {
      await send.mutateAsync({
        kind: 'rating',
        rating,
        tags: rating <= 2 ? tags : [],
        message: message.trim() || undefined,
        screen: screenName(pathname),
        context: feedbackContext(),
      })
      setSent(true)
      setTimeout(onClose, 1400)
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
          <p className="text-lg font-semibold">Thank you</p>
          <p className="text-[0.9375rem] text-text-muted">It helps us make MyConfía better.</p>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={onClose} title="How is MyConfía working for you?">
      <div className="mt-2 grid grid-cols-4 gap-2">
        {FACES.map((f) => (
          <button
            key={f.rating}
            type="button"
            onClick={() => setRating(f.rating)}
            aria-pressed={rating === f.rating}
            className={`pressable flex flex-col items-center gap-1 rounded-2xl border px-1 py-3 ${
              rating === f.rating ? 'border-accent bg-accent-soft' : 'border-border bg-bg-card'
            }`}
          >
            <span className="text-[1.75rem] leading-none" aria-hidden="true">{f.emoji}</span>
            <span className="text-[0.75rem] text-text-muted">{f.label}</span>
          </button>
        ))}
      </div>

      {rating !== null && rating <= 2 && (
        <div className="mt-4">
          <p className="mb-2 text-[0.8125rem] font-medium text-text-muted">What got in the way?</p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => {
              const on = tags.includes(r.tag)
              return (
                <button
                  key={r.tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTags((cur) => (on ? cur.filter((t) => t !== r.tag) : [...cur, r.tag]))}
                  className={`pressable h-9 rounded-full border px-3.5 text-sm ${on ? 'border-accent bg-accent-soft text-accent' : 'border-border-strong bg-bg-card text-text'}`}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {rating !== null && (
        <div className="mt-4">
          <Textarea
            rows={3}
            maxLength={1500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={rating <= 2 ? (tags.includes('other') ? 'What got in the way? (required)' : 'Tell us more (optional)') : 'Anything you’d like to add? (optional)'}
          />
          <p className="mt-1.5 text-[0.75rem] text-text-faint">Please don’t include private details from your notes.</p>
          <Button variant="primary" block className="mt-4" onClick={submit} disabled={send.isPending || needsWords}>
            {send.isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      )}
    </Sheet>
  )
}
