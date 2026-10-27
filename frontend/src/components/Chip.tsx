import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  // Optional category color for the active state (initiative filters).
  color?: string
  children: ReactNode
}

export default function Chip({ active = false, color, children, className = '', ...props }: ChipProps) {
  const style: CSSProperties | undefined =
    active && color ? { backgroundColor: color, borderColor: color, color: '#fff' } : undefined
  return (
    <button
      type="button"
      className={`pressable flex h-9 min-w-[4.5rem] flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium leading-none ${
        active ? 'border-accent bg-accent text-accent-contrast' : 'border-border-strong bg-bg-card text-text-muted'
      } ${className}`}
      style={style}
      {...props}
    >
      {children}
    </button>
  )
}

// A single-line, horizontally scrolling chip row that bleeds to the
// screen edges (the -mx-4/px-4 pair) - wrapping chips onto 2-3 lines is
// a desktop habit that pushes the actual list below the fold on a phone.
export function ChipRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 ${className}`}>{children}</div>
}
