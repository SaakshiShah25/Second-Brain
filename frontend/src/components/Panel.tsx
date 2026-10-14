import type { ReactNode } from 'react'

// A titled block with the same look as the Contacts list: one bordered panel,
// a small uppercase label, content below. Used to lay the profile page out as
// a stack of clear sections instead of one long run of text.
export default function Panel({
  title,
  action,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-border bg-bg-card ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
          {title && (
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">{title}</h2>
          )}
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
