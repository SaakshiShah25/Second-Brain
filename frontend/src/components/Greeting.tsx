import { useAuth } from '../auth/AuthContext'

function timeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
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

  return (
    <h1 className="text-2xl font-semibold tracking-tight text-text">
      {timeGreeting()}
      {name && <>, {name}</>}
    </h1>
  )
}
