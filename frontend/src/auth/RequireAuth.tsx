import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { INVITE_ONLY_EVENT } from '../api/client'
import Button from '../components/Button'
import LoadingScreen from '../components/LoadingScreen'
import { useAuth } from './AuthContext'

// Shown when the signed-in account isn't on the invite list (the backend
// answers every request with 403 "invite_only" - see api/auth.py).
function NotInvited({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-bg px-6 text-center text-text">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Lock size={26} strokeWidth={2} />
      </span>
      <h1 className="mb-2 text-xl font-semibold tracking-tight">You're not on the list yet</h1>
      <p className="mb-6 max-w-xs text-[0.9375rem] leading-relaxed text-text-muted">
        MyConfía is invite-only for now{email ? ` and ${email} hasn't been invited` : ''}. Ask the person who shared it
        with you to add your email.
      </p>
      <Button size="lg" onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  )
}

export default function RequireAuth() {
  const { session, user, loading, signOut } = useAuth()
  const [notInvited, setNotInvited] = useState(false)

  useEffect(() => {
    const flag = () => setNotInvited(true)
    window.addEventListener(INVITE_ONLY_EVENT, flag)
    return () => window.removeEventListener(INVITE_ONLY_EVENT, flag)
  }, [])

  if (loading) {
    return <LoadingScreen />
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (notInvited) {
    return (
      <NotInvited
        email={user?.email}
        onSignOut={() => {
          setNotInvited(false)
          void signOut()
        }}
      />
    )
  }
  return <Outlet />
}
