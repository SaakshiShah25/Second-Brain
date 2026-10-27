import { useEffect, useState } from 'react'

// Minimal app-wide toast ("Downloaded 3 files", "Tap Share again") -
// toast() can be called from anywhere; <Toaster/> (mounted once in
// Layout) shows the latest message for a couple of seconds.
type Listener = (msg: string) => void
const listeners = new Set<Listener>()

export function toast(msg: string) {
  listeners.forEach((l) => l(msg))
}

export default function Toaster() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const l: Listener = (m) => {
      setMsg(m)
      clearTimeout(timer)
      timer = setTimeout(() => setMsg(null), 2600)
    }
    listeners.add(l)
    return () => {
      listeners.delete(l)
      clearTimeout(timer)
    }
  }, [])
  if (!msg) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[70] flex justify-center px-6">
      <div
        role="status"
        className="rounded-full bg-text px-4 py-2.5 text-sm font-medium text-bg shadow-card"
        style={{ animation: 'fade-in 0.2s ease-out' }}
      >
        {msg}
      </div>
    </div>
  )
}
