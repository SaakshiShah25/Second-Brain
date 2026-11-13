import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Equal, type LucideIcon } from 'lucide-react'
import { PRIORITIES, priorityOf, tint, type Priority } from '../lib/taskOptions'

// The priority mark, in the style people know from Jira: a chevron pointing up for high, an equals sign for normal and
// a chevron pointing down for low, in the level's (soft) colour. No pill or fill behind it, so it stays quiet in a list.
const MARK_ICON: Record<Priority, LucideIcon> = { high: ChevronUp, normal: Equal, low: ChevronDown }
export function PriorityMark({ priority, size = 20 }: { priority: Priority; size?: number }) {
  const Icon = MARK_ICON[priority]
  const color = PRIORITIES.find((p) => p.value === priority)!.color
  return <Icon aria-hidden="true" size={size} strokeWidth={3} style={{ color }} className="flex-shrink-0" />
}

// How a chosen priority option looks: a light tint of its colour with a matching outline (not a solid fill).
export function priorityOptionStyle(color: string, active: boolean) {
  return active ? { backgroundColor: tint(color, 16), borderColor: color, color } : { borderColor: tint(color, 40), color }
}

// The priority of a task. Tap it to choose: three labelled options in a small panel that floats above everything
// (it is drawn outside the task card, so the card can't clip it).
export function PriorityFlag({ priority, onPick }: { priority: Priority; onPick: (p: Priority) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const current = PRIORITIES.find((p) => p.value === priority)!
  const PANEL_HEIGHT = 52
  const below = anchor ? anchor.bottom + 8 + PANEL_HEIGHT < window.innerHeight : true
  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
        aria-label={`Priority: ${current.label}. Change`}
        aria-expanded={!!anchor}
        title={`Priority: ${current.label}`}
        className="pressable -m-1 flex h-9 min-w-9 items-center justify-center rounded-full"
      >
        <PriorityMark priority={priority} size={22} />
      </button>
      {anchor &&
        createPortal(
          <>
            <button type="button" aria-label="Close" className="fixed inset-0 z-[60] cursor-default" onClick={() => setAnchor(null)} />
            <div
              role="menu"
              className="fixed z-[61] flex gap-1 rounded-full border border-border-strong bg-bg-card p-1 shadow-card"
              style={{
                right: Math.max(8, window.innerWidth - anchor.right - 8),
                ...(below ? { top: anchor.bottom + 8 } : { bottom: window.innerHeight - anchor.top + 8 }),
                animation: 'fade-in 0.15s ease-out',
              }}
            >
              {PRIORITIES.map((p) => {
                const active = priority === p.value
                return (
                  <button
                    key={p.value}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAnchor(null)
                      onPick(p.value)
                    }}
                    className="pressable flex h-10 items-center gap-1.5 rounded-full border pr-3.5 pl-3 text-[0.8125rem] font-semibold"
                    style={priorityOptionStyle(p.color, active)}
                  >
                    <PriorityMark priority={p.value} size={18} />
                    {p.label}
                  </button>
                )
              })}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

export { priorityOf }
