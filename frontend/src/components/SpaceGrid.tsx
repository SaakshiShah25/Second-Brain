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
import { useReorderInitiatives } from '../api/initiatives'
import type { Initiative } from '../api/types'

// The tile under the finger (or mouse) wins; if the pointer is over none, whichever the dragged tile overlaps most.
const collide: CollisionDetection = (args) => {
  const under = pointerWithin(args)
  return under.length > 0 ? under : rectIntersection(args)
}

// One tile that can be picked up and dropped on another. "Others" (id 0) always stays last, so it is neither.
function Slot({ id, children }: { id: number; children: ReactNode }) {
  const movable = id !== 0
  const drag = useDraggable({ id, disabled: !movable })
  const drop = useDroppable({ id, disabled: !movable })
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      {...drag.listeners}
      className="h-full rounded-3xl outline-none transition-shadow select-none [-webkit-touch-callout:none]"
      style={{
        opacity: drag.isDragging ? 0.35 : 1,
        touchAction: 'manipulation',
        boxShadow: drop.isOver && !drag.isDragging ? '0 0 0 3px var(--sb-accent)' : undefined,
      }}
    >
      {children}
    </div>
  )
}

// The grid of space tiles. Press and hold a tile (a phone) or drag it (a mouse), then drop it on another tile to put it
// in that place. The order is saved (server and this device) and is what the rest of the app uses too.
// `all` is every space in the user's current order, including ones with nothing in them yet (so not shown here).
export default function SpaceGrid<T extends { id: number }>({
  blocks,
  all,
  renderTile,
  trailing,
}: {
  blocks: T[]
  all: Initiative[]
  renderTile: (block: T) => ReactNode
  // After the last tile, never draggable (the "New space" tile).
  trailing?: ReactNode
}) {
  const reorder = useReorderInitiatives()
  const [draggingId, setDraggingId] = useState<number | null>(null)
  // Plain taps and scrolling still work: a touch has to rest for a moment (and a mouse move a little) to pick a tile up.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
  )
  const dragging = blocks.find((b) => b.id === draggingId) ?? null

  function onDragEnd(e: DragEndEvent) {
    setDraggingId(null)
    const from = Number(e.active.id)
    const to = e.over ? Number(e.over.id) : NaN
    const shown = blocks.map((b) => b.id).filter((id) => id !== 0)
    const a = shown.indexOf(from)
    const b = shown.indexOf(to)
    if (a < 0 || b < 0 || a === b) return
    // The dragged tile takes the dropped-on tile's place; the others shift along.
    const next = [...shown]
    next.splice(a, 1)
    next.splice(b, 0, from)
    // Spaces not shown (nothing in them yet) keep their own places in the full order.
    const ids = all.map((i) => i.id)
    const slots = ids.map((id, i) => (shown.includes(id) ? i : -1)).filter((i) => i >= 0)
    const order = [...ids]
    slots.forEach((slot, k) => {
      order[slot] = next[k]
    })
    reorder.mutate(order)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={collide} onDragStart={(e) => setDraggingId(Number(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDraggingId(null)}>
      <div className="grid grid-cols-2 gap-3 lg:auto-rows-fr lg:grid-cols-3 xl:grid-cols-4">
        {blocks.map((b) => (
          <Slot key={b.id} id={b.id}>
            {renderTile(b)}
          </Slot>
        ))}
        {trailing}
      </div>
      {blocks.filter((b) => b.id !== 0).length > 1 && (
        <p className="mt-3 px-1 text-center text-[0.8125rem] text-text-faint"><span className="lg:hidden">Press and hold a space, then drop it on another to put it where you want.</span>
          <span className="hidden lg:inline">Drag a space onto another to change the order.</span></p>
      )}
      <DragOverlay dropAnimation={null}>{dragging && <div className="scale-[1.04] opacity-95 shadow-card">{renderTile(dragging)}</div>}</DragOverlay>
    </DndContext>
  )
}
