import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/Button'
import ConfiaLogo from '../components/ConfiaLogo'
import { Input, Label } from '../components/fields'

type Mode = 'signin' | 'signup'

export default function LoginPage() {
  const { session, loading: sessionLoading } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signupDone, setSignupDone] = useState(false)

  if (!sessionLoading && session) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        // Without this, Supabase falls back to whatever "Site URL" is
        // configured in its dashboard - which can drift out of date (a
        // stale localhost:3000 from early development, in this app's
        // case) and silently sends confirmation-link clicks to a URL
        // that's no longer running anything. window.location.origin
        // self-adapts to wherever signup is actually happening - local
        // dev, the Vercel preview, or production - so this is correct
        // regardless of what the dashboard default is set to. Supabase
        // still requires this exact origin to be present in its
        // Authentication > URL Configuration > Redirect URLs allow-list,
        // or it rejects the redirect outright - that's a dashboard
        // setting this code can't reach, so it must be added there too.
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        })
        if (error) throw error
        setSignupDone(true)
      }
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
        <span className="text-lg font-semibold tracking-[-0.02em] text-text">Confía</span>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-border bg-bg-card p-6">
        <div className="mb-5 flex gap-1 rounded-lg bg-bg-elevated p-1">
          {(['signin', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setError(null)
                setSignupDone(false)
              }}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === m ? 'bg-accent text-accent-contrast' : 'text-text-muted hover:text-text'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        {signupDone ? (
          <p className="text-sm text-text-muted">
            Almost there — check <span className="text-text">{email}</span> for a confirmation
            link, then sign in.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" variant="primary" disabled={submitting} className="mt-1">
              {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
