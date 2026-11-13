import { useRef, useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'

// Swipe a row to the right to remove it (the iOS Mail / Things gesture). The row follows the finger over a red
// "Remove" strip; let go past the threshold and it slides away, let go earlier and it springs back. Vertical
// scrolling is untouched (touch-action: pan-y), and a quick horizontal flick is far shorter than the 250 ms press
// that picks a row up to drag it onto a space, so the two don't fight.
const THRESHOLD = 0.4 // fraction of the row's width
const LOCK = 10 // px of sideways movement before it counts as a swipe

export default function SwipeToRemove({ onRemove, label = 'Remove', children }: { onRemove: () => void; label?: string; children: ReactNode }) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const swiping = useRef(false)
  const wasSwipe = useRef(false)
  const box = useRef<HTMLDivElement>(null)

  function end(commit: boolean) {
    const width = box.current?.offsetWidth ?? 300
    start.current = null
    if (swiping.current) wasSwipe.current = true
    swiping.current = false
    setDragging(false)
    setDx(0)
    // Past the threshold: the row springs back and the caller asks "Are you sure?" - it only goes once that is confirmed.
    if (commit && dx > width * THRESHOLD) onRemove()
  }

  return (
    <div ref={box} className="relative overflow-hidden">
      <div className="absolute inset-0 flex items-center bg-danger pl-5 text-white" aria-hidden="true">
        <span className="flex items-center gap-2 text-[0.875rem] font-semibold" style={{ opacity: dx > 24 ? 1 : 0 }}>
          <Trash2 size={18} strokeWidth={2.2} />
          {label}
        </span>
      </div>
      <div
        className="relative bg-bg-card"
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: dragging ? undefined : 'transform 0.18s ease-out',
          touchAction: 'pan-y',
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
          wasSwipe.current = false
        }}
        onPointerMove={(e) => {
          const s = start.current
          if (!s || s.id !== e.pointerId) return
          const mx = e.clientX - s.x
          const my = e.clientY - s.y
          if (!swiping.current) {
            if (Math.abs(my) > LOCK && Math.abs(my) > Math.abs(mx)) {
              start.current = null // it's a scroll
              return
            }
            if (mx > LOCK && mx > Math.abs(my)) {
              swiping.current = true
              setDragging(true)
              e.currentTarget.setPointerCapture(e.pointerId)
            } else return
          }
          setDx(Math.max(0, mx))
        }}
        onPointerUp={() => start.current && end(true)}
        onPointerCancel={() => start.current && end(false)}
        // The tap that ends a swipe must not also open the row or tick it.
        onClickCapture={(e) => {
          if (wasSwipe.current) {
            e.stopPropagation()
            e.preventDefault()
            wasSwipe.current = false
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
