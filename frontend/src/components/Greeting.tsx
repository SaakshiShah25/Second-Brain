import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { firstName } from '../lib/displayName'

function timeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Greeting() {
  const { user } = useAuth()
  // The name the person gave (signup, Settings or Google) - never guessed from the email address.
  const name = firstName(user)
  // timeGreeting() only reflects the moment this ran - with no timer,
  // that's just the moment this component last happened to render, which
  // can be hours ago if the empty-state Chat screen was left open and
  // nothing else caused a re-render since. That's what made the greeting
  // look "wrong": it wasn't computing the wrong hour, it was silently
  // stuck on an old one until some unrelated re-render finally refreshed
  // it - reading as an abrupt, out-of-nowhere jump (e.g. straight from
  // "Good night" to "Good evening") right as it was actually looked at,
  // rather than a real, hours-long crossing between every bucket in
  // between. Re-checking every minute keeps it correct for whoever is
  // just glancing at an already-open tab, not only on a fresh mount.
  const [greeting, setGreeting] = useState(timeGreeting)
  useEffect(() => {
    const interval = setInterval(() => setGreeting(timeGreeting()), 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <h1 className="font-display text-[2rem] leading-[1.15] font-semibold tracking-[-0.03em] text-text">
      {greeting}
      {name && <>, <span className="text-accent">{name}</span></>}
    </h1>
  )
}
