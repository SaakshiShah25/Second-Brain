import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Button from '../components/Button'
import ConfiaLogo from '../components/ConfiaLogo'
import { Input, Label } from '../components/fields'

// Landing page for the link emailed by resetPasswordForEmail (see
// LoginPage.tsx). Supabase puts a one-time recovery token in the URL and
// exchanges it for a temporary session automatically (fired as a
// PASSWORD_RECOVERY auth event) - this page just waits for that session
// and then lets the user set a new password via updateUser.
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
      setTimeout(() => navigate('/'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-4">
      <div className="mb-6 flex flex-col items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-text">
          <ConfiaLogo size={26} />
        </span>
        <span className="text-lg font-semibold tracking-[-0.02em] text-text">MyConfía</span>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-border bg-bg-card p-6">
        <h1 className="mb-4 text-sm font-semibold text-text">Set a new password</h1>

        {!ready ? (
          <p className="text-sm text-text-muted">
            Open this page using the password reset link from your email.
          </p>
        ) : done ? (
          <p className="text-sm text-text-muted">Password updated — redirecting…</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <Label>New password</Label>
              <Input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" variant="primary" disabled={submitting} className="mt-1">
              {submitting ? 'Saving…' : 'Update password'}
            </Button>
          </form>
        )}

        <Link to="/login" className="mt-4 inline-block text-xs text-text-muted underline">
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
