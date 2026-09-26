import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

// Time-of-day buckets, each with a small pool of phrasings rather than
// one fixed string - "take inspiration from how dynamic Claude's own
// greeting feels" was the actual ask here. Deliberately no "Good night"
// bucket: whoever is reading this greeting is, by definition, actively
// using the app right now - telling them "good night" reads as an odd,
// slightly dismissive thing to say to someone mid-session, not a warm
// welcome. The old midnight-5am window that used to say that now gets
// its own honest, non-presumptuous phrasing instead of pretending
// they're about to head to bed.
const GREETING_POOLS: Record<'lateNight' | 'morning' | 'afternoon' | 'evening', string[]> = {
  lateNight: ['Still up', 'Burning the midnight oil', 'Up late'],
  morning: ['Good morning', 'Morning'],
  afternoon: ['Good afternoon', 'Afternoon'],
  evening: ['Good evening', 'Evening'],
}

function bucketFor(hour: number): keyof typeof GREETING_POOLS {
  if (hour < 5) return 'lateNight'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function randomFrom(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]
}

// There's no display-name field at signup (email + password only), so the
// email's local part is the best identifier available - lightly cleaned
// up (strip digits/dots, capitalize) rather than shown raw.
function nameFromEmail(email: string | undefined): string {
  if (!email) return ''
  const local = email.split('@')[0] ?? ''
  const cleaned = local.replace(/[0-9._-]+/g, ' ').trim()
  const first = cleaned.split(' ')[0] || local
  return first.charAt(0).toUpperCase() + first.slice(1)
}

export default function Greeting() {
  const { user } = useAuth()
  const name = nameFromEmail(user?.email)

  // Bucket and the chosen phrase are tracked separately: the bucket is
  // recomputed every minute so a long-open tab still crosses from
  // "Morning" to "Afternoon" on its own (see the earlier staleness fix),
  // but the phrase is only re-rolled when the BUCKET actually changes -
  // re-rolling every single tick would make the greeting visibly flicker
  // between different wordings once a minute despite the hour not having
  // moved at all, which reads as glitchy rather than dynamic.
  const [bucket, setBucket] = useState(() => bucketFor(new Date().getHours()))
  const [phrase, setPhrase] = useState(() => randomFrom(GREETING_POOLS[bucket]))

  useEffect(() => {
    const interval = setInterval(() => {
      const nextBucket = bucketFor(new Date().getHours())
      setBucket((prevBucket) => {
        if (nextBucket !== prevBucket) setPhrase(randomFrom(GREETING_POOLS[nextBucket]))
        return nextBucket
      })
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <h1 className="text-2xl font-semibold tracking-tight text-text">
      {phrase}
      {name && <>, {name}</>}
    </h1>
  )
}
