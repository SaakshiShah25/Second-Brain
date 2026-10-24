import { Link } from 'react-router-dom'

// Friendly empty list: what's missing, why it'll fill up, and a single
// button straight to the action that fills it.
export default function EmptyState({ title, body, to, cta }: { title: string; body: string; to?: string; cta?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="font-display tracking-[-0.025em] text-xl font-semibold">{title}</p>
      <p className="mt-1.5 mb-5 max-w-xs text-[0.9375rem] leading-relaxed text-text-muted">{body}</p>
      {to && cta && (
        <Link
          to={to}
          className="pressable inline-flex h-11 items-center rounded-full bg-accent px-5 text-[0.9375rem] font-medium text-accent-contrast"
        >
          {cta}
        </Link>
      )}
    </div>
  )
}
