import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SheetProps {
  children: ReactNode
  // Omit to make the sheet non-dismissable by tapping the scrim (e.g.
  // while a destructive action is in flight, or a required consent).
  onClose?: () => void
  title?: ReactNode
  // Full-height-capped sheet with its own scrolling body (long text).
  tall?: boolean
  zIndex?: number
}

// The one modal surface in the app: a bottom sheet, the native mobile
// pattern (iOS action sheets, Android modal bottom sheets) - it rises
// from where the thumb already is, instead of a desktop-style dialog
// centered in the middle of the screen. Constrained to the same phone
// column as Layout so it lines up on a wider screen too.
export default function Sheet({ children, onClose, title, tall = false, zIndex = 50 }: SheetProps) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex }}>
      <div
        className="absolute inset-0 bg-[var(--sb-scrim)]"
        style={{ animation: 'scrim-in 0.2s ease-out' }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`pb-safe relative flex w-full max-w-[480px] flex-col rounded-t-[1.75rem] bg-bg-card shadow-card ${
          tall ? 'max-h-[88dvh]' : 'max-h-[92dvh]'
        }`}
        style={{ animation: 'sheet-up 0.28s cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="h-1.5 w-10 rounded-full bg-border-strong" />
        </div>
        {title && <div className="px-5 pt-2 pb-1 text-lg font-semibold tracking-tight">{title}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
