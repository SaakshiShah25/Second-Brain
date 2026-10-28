import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Wifi, WifiOff } from 'lucide-react'
import { useConnection } from '../lib/connection'

// A thin strip at the top of the app: "You're offline" while there is no connection, then a green
// "Back online" for a few seconds once it returns. Silent while everything is fine.
export default function ConnectionBanner() {
  const { offline, unreachable } = useConnection()
  const queryClient = useQueryClient()
  const down = offline || unreachable
  const wasDown = useRef(false)
  const [showBack, setShowBack] = useState(false)

  useEffect(() => {
    if (down) {
      wasDown.current = true
      setShowBack(false)
      return
    }
    if (!wasDown.current) return
    wasDown.current = false
    setShowBack(true)
    queryClient.invalidateQueries() // anything that failed or was waiting loads again now
    const timer = window.setTimeout(() => setShowBack(false), 3500)
    return () => window.clearTimeout(timer)
  }, [down, queryClient])

  if (!down && !showBack) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-shrink-0 items-center justify-center gap-2 px-4 py-2 text-[0.8125rem] font-medium text-white ${
        down ? 'bg-text-muted' : 'bg-success'
      }`}
    >
      {down ? <WifiOff size={15} strokeWidth={2.2} /> : <Wifi size={15} strokeWidth={2.2} />}
      {down
        ? offline
          ? "You're offline - changes won't be saved"
          : "Can't reach the server - trying again…"
        : 'Back online'}
    </div>
  )
}
