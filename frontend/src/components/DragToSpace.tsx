import { useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useInitiatives } from '../api/initiatives'
import ConfirmDialog from './ConfirmDialog'
import type { Initiative, Task } from '../api/types'
import { getInitiativeStyle } from '../lib/initiativeStyle'
import { taskInitiativeId } from '../lib/taskOptions'
import { useMoveItem } from '../lib/useMoveItem'

// Wraps an open item so it can be picked up (a press-and-hold on a phone, a drag with the mouse) and dropped on
// a space. Done items aren't draggable. Must sit inside <DragToSpace>.
export function Draggable({ task, children }: { task: Task; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: task.status !== 'open' })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.35 : 1, touchAction: 'manipulation' }} className="outline-none">
      {children}
    </div>
  )
}

// The space under the finger (or mouse) wins; if the pointer is over none, whichever the dragged card overlaps most.
const collide: CollisionDetection = (args) => {
  const under = pointerWithin(args)
  return under.length > 0 ? under : rectIntersection(args)
}

// While an item is being dragged: every space as a place to drop it (also the ones that hold nothing yet).
function DropTray({ initiatives, currentId }: { initiatives: Initiative[]; currentId: number | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}>
      <div className="pointer-events-auto mx-auto max-w-[480px] rounded-2xl border border-border-strong bg-bg-card p-3 shadow-card" style={{ animation: 'fade-in 0.15s ease-out' }}>
        <p className="mb-2 text-[0.75rem] font-medium uppercase tracking-wide text-text-faint">Drop on a space</p>
        <div className="flex flex-wrap gap-2">
          {[...initiatives.map((i) => ({ id: i.id, name: i.name, initiative: i as Initiative | null })), { id: 0, name: 'Others', initiative: null }].map((c) => (
            <DropChip key={c.id} id={c.id} name={c.name} initiative={c.initiative} current={(currentId ?? 0) === c.id} />
          ))}
        </div>
      </div>
    </div>
  )
}

function DropChip({ id, name, initiative, current }: { id: number; name: string; initiative: Initiative | null; current: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `space:${id}` })
  const style = getInitiativeStyle(initiative)
  const color = style?.color ?? '#78716c'
  return (
    <span
      ref={setNodeRef}
      className="flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[0.9375rem] font-medium leading-none transition-transform"
      style={{
        color: isOver ? '#fff' : color,
        backgroundColor: isOver ? color : current ? `${color}1f` : undefined,
        borderColor: isOver ? color : `${color}66`,
        transform: isOver ? 'scale(1.06)' : undefined,
      }}
    >
      {style && <style.Icon size={15} strokeWidth={2.2} />}
      {name}
    </span>
  )
}

// Drag-an-item-onto-a-space for everything inside it: the drop tray appears while dragging, the item moves when
// released on a space, and the "move its note too?" question follows (useMoveItem).
export default function DragToSpace({ tasks, children }: { tasks: Task[]; children: ReactNode }) {
  const { data: initiatives } = useInitiatives()
  const { move, prompt } = useMoveItem()
  const [draggingId, setDraggingId] = useState<number | null>(null)
  // Dropping on a space asks "Move to X?" before anything moves.
  const [dropped, setDropped] = useState<{ task: Task; spaceId: number | null } | null>(null)
  const dragging = tasks.find((t) => t.id === draggingId) ?? null
  // Press and hold (a phone) or drag (a mouse) to pick an item up; plain taps and scrolling still work.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  function onDragEnd(e: DragEndEvent) {
    setDraggingId(null)
    const task = tasks.find((t) => t.id === e.active.id)
    const target = String(e.over?.id ?? '')
    if (!task || !/^space:\d+$/.test(target)) return
    const id = Number(target.split(':')[1])
    const spaceId = id === 0 ? null : id
    if (spaceId !== taskInitiativeId(task)) setDropped({ task, spaceId })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={collide} onDragStart={(e) => setDraggingId(Number(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDraggingId(null)}>
      {children}
      {prompt}
      {dropped && (
        <ConfirmDialog
          tone="primary"
          title={`Move to ${dropped.spaceId === null ? 'Others' : (initiatives?.find((i) => i.id === dropped.spaceId)?.name ?? 'that space')}?`}
          message={`“${dropped.task.description}” will be filed there instead.`}
          confirmLabel="Move"
          onCancel={() => setDropped(null)}
          onConfirm={() => {
            void move(dropped.task, dropped.spaceId)
            setDropped(null)
          }}
        />
      )}
      {dragging && <DropTray initiatives={initiatives ?? []} currentId={taskInitiativeId(dragging)} />}
      <DragOverlay dropAnimation={null}>
        {dragging && <div className="rounded-2xl border border-border-strong bg-bg-card px-4 py-3 text-[0.9375rem] shadow-card">{dragging.description}</div>}
      </DragOverlay>
    </DndContext>
  )
}
