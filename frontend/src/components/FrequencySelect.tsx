import { FREQUENCIES } from '../lib/keepInTouch'

// How often to keep in touch with a contact - a dropdown of fixed steps, not a
// slider: the choices are a handful of set intervals ("every 3 months"), and a
// slider would make people hunt for exactly 90 among 7 to 365.
export default function FrequencySelect({
  value,
  onChange,
  disabled = false,
  className = '',
}: {
  value: number | null | undefined
  onChange: (days: number | null) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <select
      aria-label="Keep in touch"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className={`rounded-lg border border-border-strong bg-bg-card px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 ${className}`}
    >
      <option value="">Not set</option>
      {FREQUENCIES.map((f) => (
        <option key={f.days} value={f.days}>
          {f.label}
        </option>
      ))}
    </select>
  )
}
