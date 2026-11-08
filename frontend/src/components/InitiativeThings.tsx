import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useUpdateTaskStatus } from '../api/tasks'
import type { ItemList, Task } from '../api/types'
import { byDue } from '../lib/items'
import DragToSpace, { Draggable } from './DragToSpace'
import ItemRow from './ItemRow'
import ItemSheet from './ItemSheet'
import QuickAdd from './QuickAdd'

/** "2 to-dos · 3 in lists" - the open non-note things in an initiative, for its summary line. */
export function thingCounts(items: Task[]): string {
  const open = items.filter((t) => t.status === 'open')
  const todos = open.filter((t) => !t.list_id).length
  const listed = open.length - todos
  return [todos && `${todos} ${todos === 1 ? 'to-do' : 'to-dos'}`, listed && `${listed} in lists`].filter(Boolean).join(' · ')
}

function Block({
  title,
  items,
  done = [],
  add,
  onToggle,
  onOpen,
}: {
  title: string
  items: Task[]
  // A quick-add box for this label (a label's block, not the to-dos).
  add?: { listId: number; spaceId: number | null; name: string }
  // Finished entries stay findable (a book you've read), folded away under the open ones.
  done?: Task[]
  onToggle: (t: Task) => void
  onOpen: (t: Task) => void
}) {
  const [showDone, setShowDone] = useState(false)
  return (
    <section className="mb-4" aria-label={title}>
      <h3 className="mb-2 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint">
        {title}
        <span className="font-medium normal-case tracking-normal opacity-80"> · {items.length}</span>
      </h3>
      {add && <QuickAdd listId={add.listId} initiativeId={add.spaceId} placeholder={`Add to ${add.name}`} />}
      {items.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
          {items.map((t) => (
            <Draggable key={t.id} task={t}>
              <ItemRow task={t} compactDate onToggle={onToggle} onOpen={onOpen} />
            </Draggable>
          ))}
        </div>
      )}
      {done.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="pressable mt-2 flex items-center gap-1.5 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint"
          >
            Done <span className="font-medium normal-case tracking-normal">· {done.length}</span>
            <ChevronDown size={15} strokeWidth={2.2} className={showDone ? 'rotate-180' : ''} />
          </button>
          {showDone && (
            <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
              {done.map((t) => (
                <ItemRow key={t.id} task={t} compactDate onToggle={onToggle} onOpen={onOpen} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

// Everything in an initiative that isn't a note: its open to-dos, then one block per list that has
// something of this initiative's in it ("🎬 Movies"). Together with the notes above, the initiative
// page is the whole map of what belongs to it.
export default function InitiativeThings({ items, labels = [], spaceId = null }: { items: Task[]; labels?: ItemList[]; spaceId?: number | null }) {
  const updateStatus = useUpdateTaskStatus()
  const [openId, setOpenId] = useState<number | null>(null)
  const open = items.filter((t) => t.status === 'open').sort((a, b) => byDue(a, b) || a.id - b.id)
  const active = items.find((t) => t.id === openId) ?? null
  const todos = open.filter((t) => !t.list_id)
  const lists = new Map<number, { title: string; name: string; items: Task[]; done: Task[] }>()
  // A label made for this space ("create a reading list in Personal") shows from the start, empty or not.
  for (const l of labels) lists.set(l.id, { title: `${l.emoji ? `${l.emoji} ` : ''}${l.name}`, name: l.name, items: [], done: [] })
  // One block per label, in the order they first appear; a label whose entries are all done still shows (folded).
  for (const t of [...open, ...items.filter((x) => x.status === 'done').sort((a, b) => b.id - a.id)]) {
    if (!t.list_id) continue
    const l = t.item_list
    const entry = lists.get(t.list_id) ?? { title: `${l?.emoji ? `${l.emoji} ` : ''}${l?.name ?? 'List'}`, name: l?.name ?? 'list', items: [], done: [] }
    ;(t.status === 'open' ? entry.items : entry.done).push(t)
    lists.set(t.list_id, entry)
  }
  const rowProps = {
    onToggle: (t: Task) => updateStatus.mutate({ taskId: t.id, status: t.status === 'done' ? 'open' : 'done', repeats: !!t.repeat }),
    onOpen: (t: Task) => setOpenId(t.id),
  }
  return (
    <DragToSpace tasks={items}>
    <div className="mb-4">
      <h2 className="mb-2 px-1 text-base font-semibold tracking-tight">To-dos</h2>
      <section className="mb-5">
        <QuickAdd listId={null} initiativeId={spaceId} placeholder="Add a to-do" />
        {todos.length > 0 ? (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
            {todos.map((t) => (
              <Draggable key={t.id} task={t}>
                <ItemRow task={t} compactDate onToggle={rowProps.onToggle} onOpen={rowProps.onOpen} />
              </Draggable>
            ))}
          </div>
        ) : (
          <p className="px-1 text-[0.875rem] text-text-faint">No to-dos here yet.</p>
        )}
      </section>
      <h2 className="mb-2 px-1 text-base font-semibold tracking-tight">Lists</h2>
      {lists.size === 0 && <p className="mb-5 px-1 text-[0.875rem] text-text-faint">No lists yet - tap Add, then List, to start one (a reading list, say).</p>}
      {[...lists.entries()].map(([id, l]) => (
        <Block key={id} title={l.title} items={l.items} done={l.done} add={{ listId: id, spaceId, name: l.name }} {...rowProps} />
      ))}
      {active && <ItemSheet task={active} onClose={() => setOpenId(null)} />}
    </div>
    </DragToSpace>
  )
}
