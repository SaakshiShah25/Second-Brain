// The Confía brand mark: an open arc (not a closed circle) with a small
// solid amber dot near the opening. Uses currentColor for the arc so it
// drops into the same `text-accent`-colored badges the old Brain icon
// (lucide-react) used to sit in - the amber dot stays #E9A73B always,
// on both light and dark backgrounds, per the brand spec.
interface ConfiaLogoProps {
  size?: number
  className?: string
}

export default function ConfiaLogo({ size = 24, className }: ConfiaLogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 86 86" fill="none" className={className}>
      <path
        d="M62 20C54 13 43 12 34 17C21 24 16 39 23 52C30 65 46 70 59 63"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <circle cx="63" cy="60" r="9" fill="#E9A73B" />
    </svg>
  )
}
