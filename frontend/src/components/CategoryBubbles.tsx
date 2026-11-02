import { Check, Plus, type LucideIcon } from 'lucide-react'
import type { Initiative } from '../api/types'
import { getInitiativeStyle } from '../lib/initiativeStyle'

// The user's categories as tappable bubbles - one tap to choose. Used wherever a category is picked: for the
// next note (the + on the chat input), to change where a logged note went, and to move a task.
//   noneLabel  the "no category" bubble ("Auto" before logging, "Others" once logged); omit to hide it
//   onCreate   shows a dashed "New" bubble
export default function CategoryBubbles({
  initiatives,
  selectedId,
  onSelect,
  noneLabel,
  noneIcon: NoneIcon,
  onCreate,
}: {
  initiatives: Initiative[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  noneLabel?: string
  noneIcon?: LucideIcon
  onCreate?: () => void
}) {
  const base = 'pressable flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[0.9375rem] font-medium leading-none'
  return (
    <div className="flex flex-wrap gap-2">
      {noneLabel && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selectedId === null}
          className={`${base} ${selectedId === null ? 'border-text bg-text text-bg' : 'border-border-strong bg-bg-card text-text-muted'}`}
        >
          {NoneIcon && <NoneIcon size={15} strokeWidth={2.2} />}
          {noneLabel}
          {selectedId === null && <Check size={14} strokeWidth={2.6} />}
        </button>
      )}
      {initiatives.map((i) => {
        const style = getInitiativeStyle(i)
        const active = selectedId === i.id
        return (
          <button
            key={i.id}
            type="button"
            onClick={() => onSelect(i.id)}
            aria-pressed={active}
            className={`${base} ${active ? 'text-white' : 'bg-bg-card'}`}
            style={
              style
                ? active
                  ? { backgroundColor: style.color, borderColor: style.color }
                  : { color: style.color, borderColor: `${style.color}66` }
                : undefined
            }
          >
            {style && <style.Icon size={15} strokeWidth={2.2} />}
            {i.name}
            {active && <Check size={14} strokeWidth={2.6} />}
          </button>
        )
      })}
      {onCreate && (
        <button type="button" onClick={onCreate} className={`${base} border-dashed border-border-strong bg-transparent text-text-muted`}>
          <Plus size={15} strokeWidth={2.2} />
          New
        </button>
      )}
    </div>
  )
}
