import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { useUpdateList, useDeleteList } from '../api/lists'
import { useDeleteItem, useUpdateTaskStatus } from '../api/tasks'
import type { ItemList, Task } from '../api/types'
import { byDue } from '../lib/items'
import ConfirmDialog from './ConfirmDialog'
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

type Handlers = {
  onToggle: (t: Task) => void
  onOpen: (t: Task) => void
  onDelete?: (t: Task) => void
}

// A section's heading with its + at the end: the + opens the add box for that section (and keeps it open, so a
// few entries can go in one after another).
function Block({
  title,
  count,
  items,
  list,
  heading = false,
  addPlaceholder,
  addTo,
  editing,
  onDeleteList,
  ...row
}: Handlers & {
  title: string
  count: number
  items: Task[]
  // The list this block is, when it is one (renamable and removable while editing).
  list?: { id: number; name: string }
  // The section's own title (To-dos), rather than one of the lists under it.
  heading?: boolean
  addPlaceholder: string
  addTo: { listId: number | null; spaceId: number | null }
  editing: boolean
  onDeleteList?: () => void
}) {
  const [adding, setAdding] = useState(false)
  const updateList = useUpdateList()
  return (
    <section className="mb-5" aria-label={title}>
      <div className="mb-2 flex items-center gap-2 px-1">
        {editing && list ? (
          <input
            defaultValue={list.name}
            aria-label={`Rename ${list.name}`}
            onBlur={(e) => {
              const name = e.target.value.trim()
              if (!name || name === list.name) return (e.target.value = list.name)
              updateList.mutate({ listId: list.id, name }, { onError: () => (e.target.value = list.name) })
            }}
            className="min-w-0 flex-1 rounded-lg border border-border-strong bg-bg-card px-2 py-1 text-base font-semibold focus:border-accent focus:outline-none"
          />
        ) : (
          <h3
            className={`min-w-0 flex-1 truncate ${heading ? 'text-base font-semibold tracking-tight' : 'text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint'}`}
          >
            {title}
            {!heading && <span className="font-medium normal-case tracking-normal opacity-80"> · {count}</span>}
          </h3>
        )}
        {editing && onDeleteList && (
          <button type="button" onClick={onDeleteList} aria-label={`Delete ${title}`} className="pressable flex h-8 w-8 items-center justify-center rounded-full text-text-faint hover:text-danger">
            <Trash2 size={17} strokeWidth={1.9} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-label={adding ? 'Close' : addPlaceholder}
          aria-expanded={adding}
          className="pressable flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-bg-elevated text-text-muted"
        >
          {adding ? <X size={16} strokeWidth={2.2} /> : <Plus size={17} strokeWidth={2.2} />}
        </button>
      </div>
      {adding && <QuickAdd listId={addTo.listId} initiativeId={addTo.spaceId} placeholder={addPlaceholder} autoFocus />}
      {items.length > 0 ? (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
          {items.map((t) => (
            <Draggable key={t.id} task={t}>
              <ItemRow task={t} compactDate onToggle={row.onToggle} onOpen={row.onOpen} onDelete={editing ? row.onDelete : undefined} />
            </Draggable>
          ))}
        </div>
      ) : (
        <p className="px-1 text-[0.875rem] text-text-faint">{list ? 'Nothing on this list yet - tap + to add.' : 'No to-dos here yet.'}</p>
      )}
    </section>
  )
}

// Everything in a space that isn't a note: its to-dos, then its lists - each list its own block, with its own +.
// A list entry has a tick like a to-do, but ticking it only marks it: it stays where it is (a book you've read).
export default function InitiativeThings({
  items,
  labels = [],
  spaceId = null,
  editing = false,
}: {
  items: Task[]
  labels?: ItemList[]
  spaceId?: number | null
  editing?: boolean
}) {
  const updateStatus = useUpdateTaskStatus()
  const deleteItem = useDeleteItem()
  const deleteList = useDeleteList()
  const [openId, setOpenId] = useState<number | null>(null)
  const [removing, setRemoving] = useState<{ id: number; name: string; count: number } | null>(null)
  const active = items.find((t) => t.id === openId) ?? null
  const todos = items.filter((t) => t.status === 'open' && !t.list_id).sort((a, b) => byDue(a, b) || a.id - b.id)
  const lists = new Map<number, { title: string; name: string; items: Task[] }>()
  // A list made for this space shows from the start, empty or not.
  for (const l of labels) lists.set(l.id, { title: `${l.emoji ? `${l.emoji} ` : ''}${l.name}`, name: l.name, items: [] })
  // Entries stay in the order they were added, ticked or not.
  for (const t of [...items].filter((x) => x.list_id).sort((a, b) => a.id - b.id)) {
    const l = t.item_list
    const entry = lists.get(t.list_id!) ?? { title: `${l?.emoji ? `${l.emoji} ` : ''}${l?.name ?? 'List'}`, name: l?.name ?? 'list', items: [] }
    entry.items.push(t)
    lists.set(t.list_id!, entry)
  }
  const row: Handlers = {
    onToggle: (t) => updateStatus.mutate({ taskId: t.id, status: t.status === 'done' ? 'open' : 'done', repeats: !!t.repeat }),
    onOpen: (t) => setOpenId(t.id),
    onDelete: (t) => deleteItem.mutate(t.id),
  }
  return (
    <DragToSpace tasks={items}>
      <div className="mb-4">
        <Block
          heading
          title="To-dos"
          count={todos.length}
          items={todos}
          addPlaceholder="Add a to-do"
          addTo={{ listId: null, spaceId }}
          editing={editing}
          {...row}
        />
        <h2 className="mb-2 px-1 text-base font-semibold tracking-tight">Lists</h2>
        {lists.size === 0 && <p className="mb-5 px-1 text-[0.875rem] text-text-faint">No lists yet - tap + at the top, then List, to start one (a reading list, say).</p>}
        {[...lists.entries()].map(([id, l]) => (
          <Block
            key={id}
            title={l.title}
            count={l.items.length}
            items={l.items}
            list={{ id, name: l.name }}
            addPlaceholder={`Add to ${l.name}`}
            addTo={{ listId: id, spaceId }}
            editing={editing}
            onDeleteList={() => setRemoving({ id, name: l.name, count: l.items.length })}
            {...row}
          />
        ))}
        {active && <ItemSheet task={active} onClose={() => setOpenId(null)} />}
        {removing && (
          <ConfirmDialog
            title={`Delete ${removing.name}?`}
            message={removing.count ? `This also deletes its ${removing.count} ${removing.count === 1 ? 'entry' : 'entries'}.` : 'It has nothing on it.'}
            confirmLabel="Delete"
            busy={deleteList.isPending}
            onCancel={() => setRemoving(null)}
            onConfirm={() => deleteList.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
          />
        )}
      </div>
    </DragToSpace>
  )
}
