import { useEffect, useState } from 'react'
import { CircleAlert, Copy, Mail } from 'lucide-react'
import { onFriendlyError, SUPPORT_EMAIL, type FriendlyError } from '../lib/errorDialog'
import Button from './Button'
import Sheet from './Sheet'
import { toast } from './Toast'

// The popup every failure ends in: what happened, what to do, and how to reach us with the reference code.
// Mounted once (main.tsx); anything calls showError() (lib/errorDialog.ts) to open it.
export default function ErrorDialog() {
  const [error, setError] = useState<FriendlyError | null>(null)
  useEffect(() => {
    const off = onFriendlyError(setError)
    return () => {
      off()
    }
  }, [])
  if (!error) return null

  const details = [error.title, error.message, error.code && `Reference: ${error.code}`, `Screen: ${window.location.pathname}`].filter(Boolean).join('\n')
  const mailto = SUPPORT_EMAIL
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`MyConfía problem${error.code ? ` ${error.code}` : ''}`)}&body=${encodeURIComponent(`${details}\n\nWhat I was doing:\n`)}`
    : null

  return (
    <Sheet onClose={() => setError(null)} zIndex={80}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
          <CircleAlert size={22} strokeWidth={2} />
        </span>
        <h3 className="text-lg font-semibold tracking-tight">{error.title}</h3>
      </div>
      <p className="text-[0.9375rem] leading-relaxed">{error.message}</p>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-text-muted">{error.hint}</p>
      {error.code && (
        <p className="mt-3 rounded-xl bg-bg-elevated px-3.5 py-2.5 text-[0.8125rem] text-text-muted">
          Reference <span className="font-mono font-semibold text-text">{error.code}</span> - quote this if you contact us.
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <Button variant="primary" block onClick={() => setError(null)}>
          OK
        </Button>
        <div className="flex gap-2">
          {mailto && (
            <a href={mailto} className="pressable inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-border-strong bg-bg-card text-[0.9375rem] font-medium">
              <Mail size={16} strokeWidth={2} /> Contact us
            </a>
          )}
          <Button
            block
            className="flex-1"
            onClick={() => {
              navigator.clipboard?.writeText(details).then(() => toast('Details copied'), () => toast("Couldn't copy"))
            }}
          >
            <Copy size={16} strokeWidth={2} /> Copy details
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
