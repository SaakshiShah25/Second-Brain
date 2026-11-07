import { useState } from 'react'
import { useUpdateTaskStatus } from '../api/tasks'
import type { Task } from '../api/types'
import { byDue } from '../lib/items'
import ItemRow from './ItemRow'
import ItemSheet from './ItemSheet'

/** "2 to-dos · 3 in lists" - the open non-note things in an initiative, for its summary line. */
export function thingCounts(items: Task[]): string {
  const open = items.filter((t) => t.status === 'open')
  const todos = open.filter((t) => !t.list_id).length
  const listed = open.length - todos
  return [todos && `${todos} ${todos === 1 ? 'to-do' : 'to-dos'}`, listed && `${listed} in lists`].filter(Boolean).join(' · ')
}

function Block({ title, items, onToggle, onOpen }: { title: string; items: Task[]; onToggle: (t: Task) => void; onOpen: (t: Task) => void }) {
  return (
    <section className="mb-4" aria-label={title}>
      <h3 className="mb-2 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint">
        {title}
        <span className="font-medium normal-case tracking-normal opacity-80"> · {items.length}</span>
      </h3>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
        {items.map((t) => (
          <ItemRow key={t.id} task={t} compactDate onToggle={onToggle} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

// Everything in an initiative that isn't a note: its open to-dos, then one block per list that has
// something of this initiative's in it ("🎬 Movies"). Together with the notes above, the initiative
// page is the whole map of what belongs to it.
export default function InitiativeThings({ items }: { items: Task[] }) {
  const updateStatus = useUpdateTaskStatus()
  const [openId, setOpenId] = useState<number | null>(null)
  const open = items.filter((t) => t.status === 'open').sort((a, b) => byDue(a, b) || a.id - b.id)
  const active = items.find((t) => t.id === openId) ?? null
  const todos = open.filter((t) => !t.list_id)
  const lists = new Map<number, { title: string; items: Task[] }>()
  for (const t of open) {
    if (!t.list_id) continue
    const l = t.item_list
    const entry = lists.get(t.list_id) ?? { title: `${l?.emoji ? `${l.emoji} ` : ''}${l?.name ?? 'List'}`, items: [] }
    entry.items.push(t)
    lists.set(t.list_id, entry)
  }
  const rowProps = {
    onToggle: (t: Task) => updateStatus.mutate({ taskId: t.id, status: t.status === 'done' ? 'open' : 'done', repeats: !!t.repeat }),
    onOpen: (t: Task) => setOpenId(t.id),
  }
  if (open.length === 0) return null
  return (
    <div className="mb-4">
      {todos.length > 0 && <Block title="To-dos" items={todos} {...rowProps} />}
      {[...lists.entries()].map(([id, l]) => (
        <Block key={id} title={l.title} items={l.items} {...rowProps} />
      ))}
      {active && <ItemSheet task={active} onClose={() => setOpenId(null)} />}
    </div>
  )
}
