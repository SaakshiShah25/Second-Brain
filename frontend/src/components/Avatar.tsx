// Small fixed palette, distinct hues from the primary accent - picked
// deterministically via person.id so the same person always gets the
// same color (Slack/Linear-style per-person variety in a list).
const PALETTE = [
  { bg: 'rgba(124, 108, 246, 0.18)', text: '#a99cf9' }, // violet (accent family)
  { bg: 'rgba(56, 189, 248, 0.18)', text: '#7dd3fc' }, // sky
  { bg: 'rgba(52, 211, 153, 0.18)', text: '#6ee7b7' }, // emerald
  { bg: 'rgba(251, 191, 36, 0.18)', text: '#fcd34d' }, // amber
  { bg: 'rgba(244, 114, 182, 0.18)', text: '#f9a8d4' }, // pink
  { bg: 'rgba(129, 140, 248, 0.18)', text: '#a5b4fc' }, // indigo
]

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
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
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {initials(name)}
    </div>
  )
}
