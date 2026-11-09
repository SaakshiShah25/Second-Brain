import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { useCreateItem } from '../api/tasks'
import { useInitiativeFilter, type FilterScope } from '../lib/initiativeFilter'

// The add-a-line box at the top of a list: type "Dune", press return, it's on the list.
export default function QuickAdd({
  listId,
  placeholder,
  initiativeId,
  autoFocus = false,
  filterScope = 'spaces',
}: {
  listId: number | null
  placeholder: string
  // The space the new item belongs to, when the place it is added in already says (a label's block in a space).
  initiativeId?: number | null
  autoFocus?: boolean
  // Which focus applies: the Today screen has its own (lib/initiativeFilter).
  filterScope?: FilterScope
}) {
  const [text, setText] = useState('')
  const createItem = useCreateItem()
  // With a space in focus (the chips at the foot of the screen), what you add belongs to it.
  const [focus] = useInitiativeFilter(filterScope)

  function submit(e: FormEvent) {
    e.preventDefault()
    const description = text.trim()
    if (!description || createItem.isPending) return
    createItem.mutate(
      {
        description,
        list_id: listId,
        ...(initiativeId ? { initiative_id: initiativeId } : typeof focus === 'number' && focus > 0 ? { initiative_id: focus } : {}),
      },
      { onSuccess: () => setText('') },
    )
  }

  return (
    <form onSubmit={submit} className="mb-4">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-bg-card px-3 py-1.5 focus-within:border-accent">
        <Plus size={19} strokeWidth={2} className="flex-shrink-0 text-text-faint" />
        <input
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint="done"
          className="min-w-0 flex-1 bg-transparent py-2 text-base text-text placeholder:text-text-faint focus:outline-none"
        />
        {text.trim() && (
          <button type="submit" disabled={createItem.isPending} className="pressable flex-shrink-0 text-[0.9375rem] font-medium text-link">
            {createItem.isPending ? 'Adding…' : 'Add'}
          </button>
        )}
      </div>
      {createItem.isError && (
        <p className="mt-1.5 px-1 text-[0.8125rem] text-danger">
          {createItem.error instanceof Error ? createItem.error.message : "Couldn't add that - please try again."}
        </p>
      )}
    </form>
  )
}
