import type { ReactNode } from 'react'

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}

// iOS-style segmented control - for switching between two or three
// views of the same screen (Notes / Initiatives, Sign in / Sign up),
// where underline tabs read as web navigation instead. The selected
// segment is tinted with the accent (not just a white pill on a pale
// track, which was hard to tell from the others).
export default function Segmented<T extends string>({ value, onChange, options, className = '' }: SegmentedProps<T>) {
  return (
    <div className={`flex rounded-xl bg-bg-elevated p-1 ${className}`} role="tablist">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[0.6rem] text-sm font-medium transition-all ${
              active ? 'bg-accent-soft text-accent ring-1 ring-accent/40' : 'text-text-muted'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
