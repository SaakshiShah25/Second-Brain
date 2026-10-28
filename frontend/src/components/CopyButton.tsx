import { Check, Copy } from 'lucide-react'
import { useState, type RefObject } from 'react'

// Copies what is on screen, not the markdown behind it: `source` points at the rendered
// message, so the plain-text copy reads like the message ("Category: Work", one line per
// item, "- " for list items, no ** or _ marks) and a rich-text paste (Docs, Notes, Mail) keeps the bold and
// the bullets. Without `source`, `text` is copied as it is.
export default function CopyButton({ text, source }: { text: string; source?: RefObject<HTMLElement | null> }) {
  const [copied, setCopied] = useState(false)

  if (!text.trim()) return null

  function readContent(): { plain: string; html: string | null } {
    const el = source?.current
    if (!el) return { plain: text, html: null }
    // One line per paragraph / heading / list item, list items with a "- " (the bullet
    // is drawn by CSS, so innerText alone would drop it).
    const lines: string[] = []
    el.querySelectorAll('p, li, h1, h2, h3, h4').forEach((node) => {
      if (node.tagName === 'P' && node.closest('li')) return // already inside its list item
      if (node.tagName === 'LI' && node.querySelector('li')) return // a parent item: its children are listed on their own
      const line = (node as HTMLElement).innerText.replace(/\s+/g, ' ').trim()
      if (line) lines.push(node.tagName === 'LI' ? `- ${line}` : line)
    })
    const plain = lines.join('\n')
    return { plain: plain || text, html: el.innerHTML }
  }

  async function handleCopy() {
    const { plain, html } = readContent()
    try {
      if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([plain], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(plain)
      }
    } catch {
      // Older/embedded WebViews (or a document that isn't focused) can
      // reject the async Clipboard API - execCommand still works there.
      const textarea = document.createElement('textarea')
      textarea.value = plain
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
      className="pressable flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-text-faint"
    >
      {copied ? <Check size={14} strokeWidth={1.6} /> : <Copy size={14} strokeWidth={1.6} />}
    </button>
  )
}
