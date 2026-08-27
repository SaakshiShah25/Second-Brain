import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  if (!text.trim()) return null

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Older/embedded WebViews (or a document that isn't focused) can
      // reject the async Clipboard API - execCommand still works there.
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
      } finally {
        document.body.removeChild(textarea)
      }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied' : 'Copy to clipboard'}
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-text-faint transition-colors hover:bg-white/10 hover:text-text"
    >
      {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
    </button>
  )
}
