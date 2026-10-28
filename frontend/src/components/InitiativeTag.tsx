import { getInitiativeStyle, initiativeBadgeStyle } from '../lib/initiativeStyle'

// A small tinted tag in the initiative's own color - on every to-do, so
// "IC case study" and "Fixed income learning" read apart at a glance.
export default function InitiativeTag({ initiative }: { initiative: { id?: number; name: string } | null | undefined }) {
  const style = getInitiativeStyle(initiative)
  if (!initiative || !style) {
    return <span className="flex-shrink-0 rounded-full bg-bg-elevated px-2 py-0.5 text-[0.75rem] font-medium text-text-muted">Others</span>
  }
  return (
    <span
      className="flex min-w-0 flex-shrink items-center gap-1 rounded-full px-2 py-0.5 text-[0.75rem] font-medium"
      style={initiativeBadgeStyle(style.color)}
    >
      <style.Icon size={12} strokeWidth={2.2} className="flex-shrink-0" />
      <span className="truncate">{initiative.name}</span>
    </span>
  )
}
