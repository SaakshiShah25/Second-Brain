import { useEffect, useState } from 'react'

// Minimal app-wide toast ("Downloaded 3 files", "Tap Share again") -
// toast() can be called from anywhere; <Toaster/> (mounted once in
// Layout) shows the latest message for a couple of seconds.
export interface ToastAction {
  label: string
  run: () => void
}
type Listener = (msg: string, ms: number, action?: ToastAction) => void
const listeners = new Set<Listener>()

// `ms`: how long it stays - errors carry a sentence and a reference code,
// so they stay up longer than a quick confirmation.
export function toast(msg: string, ms = 2600, action?: ToastAction) {
  listeners.forEach((l) => l(msg, ms, action))
}

export default function Toaster() {
  const [shown, setShown] = useState<{ msg: string; action?: ToastAction } | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const l: Listener = (msg, ms, action) => {
      setShown({ msg, action })
      clearTimeout(timer)
      timer = setTimeout(() => setShown(null), ms)
    }
    listeners.add(l)
    return () => {
      listeners.delete(l)
      clearTimeout(timer)
    }
  }, [])
  if (!shown) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[70] flex justify-center px-6 lg:bottom-8 lg:justify-end lg:px-8">
      <div
        role="status"
        className="flex items-center gap-3 rounded-full bg-text px-4 py-2.5 text-sm font-medium text-bg shadow-card"
        style={{ animation: 'fade-in 0.2s ease-out' }}
      >
        {shown.msg}
        {shown.action && (
          <button
            type="button"
            onClick={() => {
              shown.action!.run()
              setShown(null)
            }}
            className="pressable pointer-events-auto -my-1 -mr-1.5 rounded-full bg-bg px-3 py-1 text-sm font-semibold text-text"
          >
            {shown.action.label}
          </button>
        )}
      </div>
    </div>
  )
}
