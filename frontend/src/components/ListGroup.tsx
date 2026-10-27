import type { ReactNode } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

// iOS "inset grouped" list - the Settings-app pattern: a small caps
// header, a rounded card of hairline-separated rows, and an optional
// footnote. Used for Settings and any other list of short actions.
export function ListGroup({ title, footer, children }: { title?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h2 className="mb-1.5 px-4 text-[0.8125rem] font-medium uppercase tracking-wide text-text-faint">{title}</h2>}
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[0.8125rem] leading-relaxed text-text-faint">{footer}</p>}
    </section>
  )
}

interface ListRowProps {
  icon?: LucideIcon
  iconColor?: string
  // A custom leading visual instead of `icon` (e.g. the Google logo).
  leading?: ReactNode
  label: ReactNode
  detail?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  to?: string
  chevron?: boolean
  danger?: boolean
  disabled?: boolean
  // Quiet icon tile: a pale tint of iconColor with the icon in iconColor,
  // instead of a solid fill with a white icon - for rows that shouldn't
  // compete for attention (Merge, Delete).
  soft?: boolean
}

export function ListRow({ icon: Icon, iconColor, leading, label, detail, trailing, onClick, to, chevron, danger, disabled, soft }: ListRowProps) {
  const body = (
    <>
      {leading && (
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-bg-elevated">{leading}</span>
      )}
      {Icon && (
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={
            soft
              ? {
                  backgroundColor: `color-mix(in srgb, ${iconColor ?? 'var(--sb-accent)'} 14%, transparent)`,
                  color: iconColor ?? 'var(--sb-accent)',
                }
              : { backgroundColor: iconColor ?? 'var(--sb-accent)', color: '#fff' }
          }
        >
          <Icon size={17} strokeWidth={2} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-base ${danger ? 'text-danger' : 'text-text'}`}>{label}</span>
        {detail && <span className="mt-0.5 block text-[0.8125rem] leading-snug text-text-muted">{detail}</span>}
      </span>
      {trailing}
      {(chevron || to) && <ChevronRight size={18} strokeWidth={2} className="flex-shrink-0 text-text-faint" />}
    </>
  )
  const cls = `flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2.5 text-left ${
    onClick || to ? 'pressable' : ''
  } disabled:opacity-50`
  if (to) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`flex h-[1.9rem] w-[3.1rem] flex-shrink-0 items-center rounded-full p-0.5 transition-colors ${
        on ? 'bg-success' : 'bg-bg-hover'
      }`}
    >
      <span
        className={`h-[1.65rem] w-[1.65rem] rounded-full bg-white shadow-sm transition-transform ${
          on ? 'translate-x-[1.2rem]' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
