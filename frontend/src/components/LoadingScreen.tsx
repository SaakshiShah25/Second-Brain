import { useEffect, useState } from 'react'
import { Brain } from 'lucide-react'

// Full-screen startup loading state - shown while auth/settings resolve
// before the real app can render (RequireAuth, TermsGate). A bouncing
// logo + a rotating pool of playful phrases instead of a bare "Loading…",
// so the wait (auth check, first Supabase round-trip) feels like the app
// is doing something interesting rather than stalled.
const PHRASES = [
  'Marinating your ideas…',
  'Fixing everything, getting it ready…',
  'Waking up your second brain…',
  'Untangling your notes…',
  'Connecting the dots…',
  'Warming up the neurons…',
  'Getting your thoughts in order…',
  'Dusting off your memories…',
]

const ROTATE_MS = 1700

export default function LoadingScreen() {
  // Random starting phrase so a quick reload doesn't always show the
  // exact same first line.
  const [index, setIndex] = useState(() => Math.floor(Math.random() * PHRASES.length))

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % PHRASES.length), ROTATE_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg text-text-muted">
      <span className="flex h-14 w-14 animate-bounce items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Brain size={28} strokeWidth={2} />
      </span>
      <p key={index} className="text-sm" style={{ animation: 'fade-in 0.3s ease-out' }}>
        {PHRASES[index]}
      </p>
    </div>
  )
}
