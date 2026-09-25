import { useState, type ReactNode } from 'react'

interface DisclosureProps {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  // Optional colored left edge (a hex string) - used by InteractionCard to
  // give each note a category "spine" so a list of notes reads as
  // visually distinct cards instead of identical rows of text. Every
  // other caller (PersonDetailPage's timeline/mentioned-in/danger-zone)
  // omits this and is unaffected.
  accentColor?: string
}

// Generic collapsed-by-default summary/content row - the shared "click to
// reveal" building block for PersonDetailPage's timeline entries,
// mentioned-in entries, and danger-zone section.
export default function Disclosure({ summary, children, defaultOpen = false, accentColor }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div
      className="rounded-xl border border-border bg-bg-card"
      style={accentColor ? { borderLeftColor: accentColor, borderLeftWidth: 3 } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition-colors hover:text-text"
      >
        <span className="min-w-0 flex-1 text-text-muted">{summary}</span>
        <span
          className={`flex-shrink-0 text-text-faint transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        >
          ›
        </span>
      </button>
      {open && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  )
}
