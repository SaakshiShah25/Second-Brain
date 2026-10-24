// The app's fun hues (index.css --sb-fun-*, which brighten in the dark
// theme) - picked deterministically via
// person.id so the same person always gets the same color (Clay/Slack-
// style per-person variety in a list). Tinted ground + solid text.
const PALETTE = [
  'var(--sb-fun-orange)',
  'var(--sb-fun-sky)',
  'var(--sb-fun-pink)',
  'var(--sb-fun-teal)',
  'var(--sb-fun-sun)',
  'var(--sb-fun-blue)',
  'var(--sb-fun-red)',
]

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-[0.9375rem]',
  lg: 'h-20 w-20 text-2xl',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

interface AvatarProps {
  id: number
  name: string
  size?: keyof typeof SIZES
}

export default function Avatar({ id, name, size = 'md' }: AvatarProps) {
  const color = PALETTE[id % PALETTE.length]
  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]}`}
      style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      {initials(name)}
    </div>
  )
}
