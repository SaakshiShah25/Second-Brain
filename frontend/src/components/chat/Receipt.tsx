import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Repeat as RepeatIcon, Undo2 } from 'lucide-react'
import type { CreatedItem } from '../../api/types'
import { friendlyDate, timeLabel } from '../../lib/dates'
import { itemPath, repeatLabel } from '../../lib/items'

// What a capture just saved, one tappable line per item - "🎬 Oppenheimer → Movies",
// "☐ Pay Rahul → Tasks · Friday" - so the user can see where everything went and fix anything
// in one tap (the line opens the item), or take the whole capture back with Undo.
export default function Receipt({
  items,
  noteSaved,
  undone,
  onUndo,
}: {
  items: CreatedItem[]
  noteSaved: boolean
  undone?: boolean
  onUndo?: () => Promise<void>
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (undone) return <p className="mt-2 text-[0.875rem] italic text-text-muted">Undone - nothing from this was kept.</p>

  return (
    <div className="mt-2">
      {items.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
          {items.map((item) => {
            const when = [item.due_date ? friendlyDate(item.due_date) : '', timeLabel(item.due_time)].filter(Boolean).join(', ')
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(itemPath(item.list_id, item.id))}
                className="pressable flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
              >
                <span className="w-5 flex-shrink-0 text-center text-[1rem] leading-none">{item.list_emoji || '☑️'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem]">{item.description}</span>
                  <span className="flex items-center gap-1.5 text-[0.8125rem] text-text-muted">
                    <span className="truncate">{item.list_name ?? (item.owner === 'them' ? 'Tasks · waiting on them' : 'Tasks')}</span>
                    {when && <span className="flex-shrink-0">· {when}</span>}
                    {item.repeat && (
                      <span className="flex flex-shrink-0 items-center gap-1">
                        · <RepeatIcon size={11} strokeWidth={2.2} /> {repeatLabel(item.repeat)}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight size={16} strokeWidth={2} className="flex-shrink-0 text-text-faint" />
              </button>
            )
          })}
        </div>
      )}
      {onUndo && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setFailed(false)
            try {
              await onUndo()
            } catch {
              setFailed(true)
            } finally {
              setBusy(false)
            }
          }}
          className="pressable mt-2 flex items-center gap-1.5 rounded-full border border-border-strong bg-bg-card px-3.5 py-1.5 text-[0.8125rem] font-medium text-text-muted disabled:opacity-50"
        >
          <Undo2 size={14} strokeWidth={2} />
          {busy ? 'Undoing…' : noteSaved && items.length ? 'Undo - delete the note and these' : noteSaved ? 'Undo - delete this note' : 'Undo'}
        </button>
      )}
      {failed && <p className="mt-1 text-[0.8125rem] text-danger">Couldn't undo that - please try again.</p>}
    </div>
  )
}
