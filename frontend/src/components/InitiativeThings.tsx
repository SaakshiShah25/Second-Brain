import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronUp, ListChecks, ListTodo, Pencil, Plus, Trash2, X, type LucideIcon } from 'lucide-react'
import { useUpdateList, useDeleteList } from '../api/lists'
import { useDeleteItem, useUpdateTaskStatus } from '../api/tasks'
import type { ItemList, Task } from '../api/types'
import { byDue } from '../lib/items'
import type { SpaceSection } from '../lib/useSectionOrder'
import ConfirmDialog from './ConfirmDialog'
import DragToSpace, { Draggable } from './DragToSpace'
import ItemRow from './ItemRow'
import ItemSheet from './ItemSheet'
import AddToSpace from './AddToSpace'
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
  onSwipeRemove?: (t: Task) => void
}

// The heading of one of the three parts of a space (Notes, To-dos, Lists): its name and count, a + that adds to THAT
// part only, and a pencil that edits THAT part only.
export function SectionHeader({
  icon: Icon,
  title,
  count,
  add,
  editing,
  onEdit,
  editLabel,
  mover,
}: {
  icon: LucideIcon
  title: string
  count: number
  // The + (a button, or AddToSpace's own); omit for none.
  add?: ReactNode
  editing: boolean
  // Omit when there is nothing to edit yet.
  onEdit?: () => void
  editLabel: string
  // While the space is being edited: move this part up or down the page.
  mover?: { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void }
}) {
  return (
    <div className="mb-2 flex items-center gap-2 px-1">
      <Icon size={17} strokeWidth={2.2} className="flex-shrink-0 text-text-muted" />
      <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">
        {title}
        <span className="font-medium text-text-faint"> · {count}</span>
      </h2>
      {mover && (
        <span className="flex items-center rounded-full bg-bg-elevated">
          <button type="button" onClick={mover.onUp} disabled={!mover.canUp} aria-label={`Move ${title} up`} className="pressable flex h-9 w-9 items-center justify-center rounded-full text-text-muted disabled:opacity-30">
            <ChevronUp size={19} strokeWidth={2.4} />
          </button>
          <button type="button" onClick={mover.onDown} disabled={!mover.canDown} aria-label={`Move ${title} down`} className="pressable flex h-9 w-9 items-center justify-center rounded-full text-text-muted disabled:opacity-30">
            <ChevronDown size={19} strokeWidth={2.4} />
          </button>
        </span>
      )}
      {add}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={editing ? `Done editing ${title.toLowerCase()}` : editLabel}
          aria-pressed={editing}
          className={`pressable flex h-9 w-9 items-center justify-center rounded-full ${editing ? 'bg-accent-soft text-accent' : 'text-text-muted'}`}
        >
          {editing ? <Check size={18} strokeWidth={2.4} /> : <Pencil size={16} strokeWidth={2} />}
        </button>
      )}
    </div>
  )
}

export function PlusButton({ onClick, label, open = false }: { onClick: () => void; label: string; open?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-contrast"
    >
      {open ? <X size={18} strokeWidth={2.4} /> : <Plus size={19} strokeWidth={2.4} />}
    </button>
  )
}

// One list: its name (renamable while the lists are being edited), a small + that adds an entry to it - and keeps the
// box open so several can go in one after another - and its entries.
function ListBlock({
  list,
  title,
  items,
  spaceId,
  editing,
  onDeleteList,
  ...row
}: Handlers & {
  list: { id: number; name: string }
  title: string
  items: Task[]
  spaceId: number | null
  editing: boolean
  onDeleteList: () => void
}) {
  const [adding, setAdding] = useState(false)
  const updateList = useUpdateList()
  return (
    <section className="mb-4" aria-label={title}>
      <div className="mb-2 flex items-center gap-2 px-1">
        {editing ? (
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
          <h3 className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint">
            {title}
            <span className="font-medium normal-case tracking-normal opacity-80"> · {items.length}</span>
          </h3>
        )}
        {editing && (
          <button type="button" onClick={onDeleteList} aria-label={`Delete ${title}`} className="pressable flex h-8 w-8 items-center justify-center rounded-full text-text-faint hover:text-danger">
            <Trash2 size={17} strokeWidth={1.9} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-label={adding ? 'Close' : `Add to ${list.name}`}
          aria-expanded={adding}
          className="pressable flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-bg-elevated text-text-muted"
        >
          {adding ? <X size={16} strokeWidth={2.2} /> : <Plus size={17} strokeWidth={2.2} />}
        </button>
      </div>
      {adding && <QuickAdd listId={list.id} initiativeId={spaceId} placeholder={`Add to ${list.name}`} autoFocus />}
      {items.length > 0 ? (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
          {items.map((t) => (
            <Draggable key={t.id} task={t}>
              <ItemRow task={t} compactDate onToggle={row.onToggle} onOpen={row.onOpen} onDelete={editing ? row.onDelete : undefined} onSwipeRemove={row.onSwipeRemove} />
            </Draggable>
          ))}
        </div>
      ) : (
        <p className="px-1 text-[0.875rem] text-text-faint">Nothing on this list yet - tap + to add.</p>
      )}
    </section>
  )
}

// Everything in a space that isn't a note, as two parts of its own: To-dos (one plain list, its own + and pencil) and
// Lists (any number of them, a + to start a new one - always there, even with none yet - and a pencil for the lists).
// A list entry has a tick like a to-do, but ticking it only marks it: it stays where it is (a book you've read).
export default function InitiativeThings({
  items,
  labels = [],
  spaceId = null,
  spaceName = 'this space',
  order,
  onMove,
  notesSection,
}: {
  items: Task[]
  labels?: ItemList[]
  spaceId?: number | null
  spaceName?: string
  // The order of the three parts of the space page, and (only while the space is being edited) how to move one.
  order: SpaceSection[]
  onMove?: (section: SpaceSection, by: -1 | 1) => void
  // The Notes part, drawn by the page; it sits among the other two in this order.
  notesSection: (mover?: { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void }) => ReactNode
}) {
  const moverFor = (section: SpaceSection) =>
    onMove ? { canUp: order.indexOf(section) > 0, canDown: order.indexOf(section) < order.length - 1, onUp: () => onMove(section, -1), onDown: () => onMove(section, 1) } : undefined
  const updateStatus = useUpdateTaskStatus()
  const deleteItem = useDeleteItem()
  const deleteList = useDeleteList()
  const [openId, setOpenId] = useState<number | null>(null)
  const [addingTodo, setAddingTodo] = useState(false)
  const [editTodos, setEditTodos] = useState(false)
  const [editLists, setEditLists] = useState(false)
  // To-dos you just ticked stay where they were, struck through, until you swipe them away (or leave the page).
  const [justDone, setJustDone] = useState<Set<number>>(new Set())
  const [removing, setRemoving] = useState<{ id: number; name: string; count: number } | null>(null)
  const active = items.find((t) => t.id === openId) ?? null
  const todos = items.filter((t) => (t.status === 'open' || justDone.has(t.id)) && !t.list_id).sort((a, b) => byDue(a, b) || a.id - b.id)
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
    onToggle: (t) => {
      const finishing = t.status !== 'done'
      if (!t.repeat) setJustDone((prev) => new Set(finishing ? prev.add(t.id) : [...prev].filter((id) => id !== t.id)))
      updateStatus.mutate({ taskId: t.id, status: finishing ? 'done' : 'open', repeats: !!t.repeat })
    },
    onOpen: (t) => setOpenId(t.id),
    onDelete: (t) => deleteItem.mutate(t.id),
    onSwipeRemove: (t) => deleteItem.mutate(t.id),
  }
  const todosNode = (
  <section key="todos" className="mb-6" aria-label="To-dos">
    <SectionHeader
      icon={ListTodo}
      title="To-dos"
      count={todos.length}
      add={<PlusButton onClick={() => setAddingTodo((v) => !v)} label={addingTodo ? 'Close' : 'Add a to-do'} open={addingTodo} />}
      editing={editTodos}
      onEdit={todos.length ? () => setEditTodos((v) => !v) : undefined}
      editLabel="Edit to-dos"
          mover={moverFor('todos')}
    />
    {addingTodo && <QuickAdd listId={null} initiativeId={spaceId} placeholder="Add a to-do" autoFocus />}
    {todos.length > 0 ? (
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
        {todos.map((t) => (
          <Draggable key={t.id} task={t}>
            <ItemRow task={t} compactDate onToggle={row.onToggle} onOpen={row.onOpen} onDelete={editTodos ? row.onDelete : undefined} onSwipeRemove={row.onSwipeRemove} />
          </Draggable>
        ))}
      </div>
    ) : (
      <p className="px-1 text-[0.875rem] text-text-faint">No to-dos here yet - tap + to add one.</p>
    )}
  </section>
  )
  const listsNode = (
  <section key="lists" className="mb-6" aria-label="Lists">
    <SectionHeader
      icon={ListChecks}
      title="Lists"
      count={lists.size}
      add={<AddToSpace spaceId={spaceId} spaceName={spaceName} kind="list" />}
      editing={editLists}
      onEdit={lists.size ? () => setEditLists((v) => !v) : undefined}
      editLabel="Edit lists"
          mover={moverFor('lists')}
    />
    {lists.size === 0 && (
      <p className="px-1 text-[0.875rem] text-text-faint">No lists yet - tap + to start one (a reading list, say), then add to it as you go.</p>
    )}
    {[...lists.entries()].map(([id, l]) => (
      <ListBlock
        key={id}
        list={{ id, name: l.name }}
        title={l.title}
        items={l.items}
        spaceId={spaceId}
        editing={editLists}
        onDeleteList={() => setRemoving({ id, name: l.name, count: l.items.length })}
        {...row}
      />
    ))}
  </section>
  )
  return (
    <DragToSpace tasks={items}>
      <div className="mb-4">
        {order.map((section) => (section === 'notes' ? notesSection(moverFor('notes')) : section === 'todos' ? todosNode : listsNode))}
        {editTodos && <p className="mt-2 px-1 text-[0.8125rem] text-text-muted">Editing to-dos: tap one to change it, tap the bin to remove it. Tap ✓ when done.</p>}
        {editLists && <p className="mt-2 px-1 text-[0.8125rem] text-text-muted">Editing lists: rename a list, remove a list or its entries. Tap ✓ when done.</p>}
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
