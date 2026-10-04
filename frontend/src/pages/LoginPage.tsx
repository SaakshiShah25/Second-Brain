import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/Button'
import ConfiaLogo from '../components/ConfiaLogo'
import { Input, Label } from '../components/fields'

type Mode = 'signin' | 'signup' | 'forgot'

export default function LoginPage() {
  const { session, loading: sessionLoading } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signupDone, setSignupDone] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)

  if (!sessionLoading && session) {
    return <Navigate to="/" replace />
  }

  function switchMode(m: Mode) {
    setMode(m)
    setError(null)
    setSignupDone(false)
    setResetSent(false)
  }

  async function handleGoogleSignIn() {
    setError(null)
    setGoogleSubmitting(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setGoogleSubmitting(false)
    }
    // On success Supabase redirects to Google, so there's nothing else to do here.
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
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
      } else {
        // Same dashboard allow-list caveat as signup above - /reset-password
        // must be added to Authentication > URL Configuration > Redirect URLs.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setResetSent(true)
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
        <span className="text-lg font-semibold tracking-[-0.02em] text-text">MyConfía</span>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-border bg-bg-card p-6">
        {mode === 'forgot' ? (
          <div className="mb-5">
            <h1 className="text-sm font-semibold text-text">Reset your password</h1>
            <p className="mt-0.5 text-xs text-text-muted">
              We'll email you a link to set a new password.
            </p>
          </div>
        ) : (
          <div className="mb-5 flex gap-1 rounded-lg bg-bg-elevated p-1">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  mode === m ? 'bg-accent text-accent-contrast' : 'text-text-muted hover:text-text'
                }`}
              >
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>
        )}

        {mode === 'forgot' && resetSent ? (
          <p className="text-sm text-text-muted">
            Check <span className="text-text">{email}</span> for a link to reset your password.
          </p>
        ) : signupDone ? (
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
            {mode !== 'forgot' && (
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
            )}
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="-mt-1 self-end text-xs text-accent underline"
              >
                Forgot password?
              </button>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" variant="primary" disabled={submitting} className="mt-1">
              {submitting
                ? 'Please wait…'
                : mode === 'signin'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Send reset link'}
            </Button>
            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="self-center text-xs text-text-muted underline"
              >
                Back to sign in
              </button>
            )}
          </form>
        )}

        {mode !== 'forgot' && !signupDone && (
          <>
            <div className="my-4 flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-text-faint">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={googleSubmitting}
              onClick={handleGoogleSignIn}
              className="flex w-full items-center justify-center gap-2"
            >
              <GoogleIcon size={16} />
              {googleSubmitting ? 'Redirecting…' : 'Continue with Google'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20.5H24v7h11.3c-1.6 4.5-5.9 7.5-11.3 7.5-6.9 0-12.5-5.6-12.5-12.5S17.1 10 24 10c3.1 0 5.9 1.1 8.1 3l5-5C33.5 4.9 29 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l5.7 4.2C13.5 15.1 18.4 12 24 12c3.1 0 5.9 1.1 8.1 3l5-5C33.5 6.9 29 5 24 5c-7.8 0-14.5 4.4-17.7 10.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 43c5 0 9.4-1.8 12.8-4.7l-5.9-5c-1.9 1.4-4.3 2.2-6.9 2.2-5.4 0-9.7-3-11.3-7.4l-5.9 4.6C9.5 38.5 16.2 43 24 43z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20.5H24v7h11.3c-.8 2.2-2.2 4.1-4.1 5.4l5.9 5C40.9 34.9 44 30.2 44 24c0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}
