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
    <div className="bg-bg">
      <div className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-[480px] flex-col px-6">
        <div className="flex flex-1 flex-col justify-center pt-10 pb-8">
          <span className="mb-6 text-text">
            <ConfiaLogo size={52} />
          </span>
          <h1 className="font-display text-[2.375rem] leading-[1.1] font-semibold tracking-[-0.035em]">
            Set a new password
          </h1>
        </div>

        <div className="pb-8">
          {!ready ? (
            <p className="rounded-2xl bg-bg-elevated p-4 text-[0.9375rem] text-text-muted">
              Open this page using the password reset link from your email.
            </p>
          ) : done ? (
            <p className="rounded-2xl bg-bg-elevated p-4 text-[0.9375rem] text-text-muted">Password updated — redirecting…</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
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
              <Button type="submit" variant="primary" size="lg" block disabled={submitting} className="mt-1">
                {submitting ? 'Saving…' : 'Update password'}
              </Button>
            </form>
          )}

          <Link to="/login" className="pressable mt-4 block py-2 text-center text-[0.9375rem] font-medium text-link">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
