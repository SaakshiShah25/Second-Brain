import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, ListChecks, ListTodo, Pencil, Plus, Trash2, X, type LucideIcon } from 'lucide-react'
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
          <button type="button" onClick={mover.onUp} disabled={!mover.canUp} aria-label={`Move ${title} earlier`} className="pressable flex h-9 w-9 items-center justify-center rounded-full text-text-muted disabled:opacity-30">
            <ChevronLeft size={19} strokeWidth={2.4} />
          </button>
          <button type="button" onClick={mover.onDown} disabled={!mover.canDown} aria-label={`Move ${title} later`} className="pressable flex h-9 w-9 items-center justify-center rounded-full text-text-muted disabled:opacity-30">
            <ChevronRight size={19} strokeWidth={2.4} />
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
              <ItemRow task={t} compactDate onToggle={row.onToggle} onOpen={row.onOpen} onDelete={editing ? row.onDelete : undefined} onSwipeRemove={row.onSwipeRemove} swipe={false} />
            </Draggable>
          ))}
        </div>
      ) : (
        <p className="px-1 text-[0.875rem] text-text-faint">Nothing on this list yet - tap + to add.</p>
      )}
    </section>
  )
}

const SECTION_LABEL: Record<SpaceSection, string> = { notes: 'Notes', todos: 'To-dos', lists: 'Lists' }

// The three parts of a space, as pages side by side that you move between - one fills the whole space at a time.
// On a phone you swipe (CSS scroll-snap, so it feels native, and it goes round too) with faint arrows at both edges. On a
// laptop there are round arrow buttons in the margins, with soft shadows at both edges to say "there is more this way";
// they go round in a circle (after Lists comes Notes again), and the left / right arrow keys do the same.
// A tab bar on both shows where you are and jumps straight to a part. The strip is only as tall as the page you are
// on, so a short page never leaves a long blank scroll under it.
function Pages({ order, counts, panes }: { order: SpaceSection[]; counts: Record<SpaceSection, number>; panes: Record<SpaceSection, ReactNode> }) {
  const strip = useRef<HTMLDivElement>(null)
  const paneRefs = useRef<(HTMLDivElement | null)[]>([])
  const [active, setActive] = useState(0)
  const [height, setHeight] = useState<number | undefined>(undefined)

  const onScroll = useCallback(() => {
    const el = strip.current
    if (el && el.clientWidth > 0) setActive(Math.max(0, Math.min(order.length - 1, Math.round(el.scrollLeft / el.clientWidth))))
  }, [order.length])

  // Follow the height of the page that is showing (it changes as to-dos are added or ticked).
  useLayoutEffect(() => {
    const pane = paneRefs.current[active]
    if (!pane || typeof ResizeObserver === 'undefined') return
    const measure = () => setHeight(pane.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(pane)
    return () => ro.disconnect()
  }, [active, order])

  // When a part is moved to another place in the order, show it where it went.
  useEffect(() => {
    onScroll()
  }, [order, onScroll])

  function goTo(i: number) {
    const el = strip.current
    el?.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }
  // The laptop's arrows (and arrow keys) wrap around: one past the last is the first.
  const n = order.length
  const step = useCallback(
    (by: 1 | -1) => {
      const el = strip.current
      if (!el) return
      const next = (Math.round(el.scrollLeft / Math.max(1, el.clientWidth)) + by + n) % n
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    },
    [n],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target
      if (el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      if (!window.matchMedia('(min-width: 1024px)').matches || document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      step(e.key === 'ArrowRight' ? 1 : -1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [step])
  const nameAt = (i: number) => SECTION_LABEL[order[(i + n) % n]]

  // A phone's swipe goes round too: a scroll strip stops at its ends, so a swipe that tries to go past the last page
  // (or before the first) is caught when the finger lifts and sent round to the other end.
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current
    touch.current = null
    const el = strip.current
    if (!start || !el) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return // not a clear sideways swipe
    const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2
    const atStart = el.scrollLeft <= 2
    if (dx < 0 && atEnd) goTo(0)
    else if (dx > 0 && atStart) goTo(n - 1)
  }

  return (
    <div className="relative lg:px-14">
      {/* Tab bar: shows where you are, and jumps to a part. */}
      <div role="tablist" className="mb-3 flex rounded-full bg-bg-elevated p-1 lg:mx-auto lg:max-w-md">
        {order.map((section, i) => (
          <button
            key={section}
            type="button"
            role="tab"
            aria-selected={active === i}
            onClick={() => goTo(i)}
            className={`pressable flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[0.875rem] font-medium ${
              active === i ? 'bg-bg-card text-text shadow-card' : 'text-text-muted'
            }`}
          >
            {SECTION_LABEL[section]}
            <span className="text-[0.75rem] opacity-70">{counts[section]}</span>
          </button>
        ))}
      </div>
      <div
        ref={strip}
        onScroll={onScroll}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden overscroll-x-contain transition-[height] duration-200 lg:mx-0"
        style={height !== undefined ? { height } : undefined}
      >
        {order.map((section, i) => (
          <div
            key={section}
            ref={(el) => {
              paneRefs.current[i] = el
            }}
            className="w-full flex-shrink-0 snap-center px-4 lg:px-0"
          >
            {panes[section]}
          </div>
        ))}
      </div>
      {/* Laptop: soft shadows at both edges, and round arrows in the margins (they wrap around). */}
      <span aria-hidden="true" className="pointer-events-none absolute top-14 bottom-0 left-14 z-10 hidden w-8 bg-gradient-to-r from-black/[0.04] to-transparent lg:block" />
      <span aria-hidden="true" className="pointer-events-none absolute top-14 right-14 bottom-0 z-10 hidden w-8 bg-gradient-to-l from-black/[0.04] to-transparent lg:block" />
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label={`Previous: ${nameAt(active - 1)}`}
        title={`Previous: ${nameAt(active - 1)}`}
        className="pressable absolute top-28 left-0 z-20 hidden h-9 w-9 items-center justify-center rounded-full text-text-faint hover:bg-bg-hover hover:text-text lg:flex"
      >
        <ChevronLeft size={20} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label={`Next: ${nameAt(active + 1)}`}
        title={`Next: ${nameAt(active + 1)}`}
        className="pressable absolute top-28 right-0 z-20 hidden h-9 w-9 items-center justify-center rounded-full text-text-faint hover:bg-bg-hover hover:text-text lg:flex"
      >
        <ChevronRight size={20} strokeWidth={1.8} />
      </button>
      {/* Faint arrows toward the pages out of sight - a hint, not a button (the tab bar and the swipe do the work). */}
      {(
        <span aria-hidden="true" className="pointer-events-none fixed top-1/2 left-0.5 z-10 text-text-muted lg:hidden" style={{ animation: 'nudge-left 2.2s ease-in-out infinite' }}>
          <ChevronLeft size={22} strokeWidth={1.6} />
        </span>
      )}
      {(
        <span aria-hidden="true" className="pointer-events-none fixed top-1/2 right-0.5 z-10 text-text-muted lg:hidden" style={{ animation: 'nudge-right 2.2s ease-in-out infinite' }}>
          <ChevronRight size={22} strokeWidth={1.6} />
        </span>
      )}
    </div>
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
  notesCount = 0,
}: {
  items: Task[]
  labels?: ItemList[]
  spaceId?: number | null
  spaceName?: string
  // The order of the three parts of the space page, and (only while the space is being edited) how to move one.
  order: SpaceSection[]
  onMove?: (section: SpaceSection, by: -1 | 1) => void
  // The Notes part, drawn by the page; it sits among the other two in this order.
  notesCount?: number
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
            <ItemRow task={t} compactDate onToggle={row.onToggle} onOpen={row.onOpen} onDelete={editTodos ? row.onDelete : undefined} onSwipeRemove={row.onSwipeRemove} swipe={false} />
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
        {/* A phone: Notes, To-dos and Lists are three pages you swipe between (a tab bar and faint arrows show it).
            A laptop: the same three side by side. Either way in the order chosen while editing the space. */}
        <Pages
          order={order}
          counts={{ notes: notesCount, todos: todos.length, lists: lists.size }}
          panes={{
            notes: notesSection(moverFor('notes')),
            todos: todosNode,
            lists: listsNode,
          }}
        />
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
