import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { getAuthProviders, supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/Button'
import ConfiaLogo from '../components/ConfiaLogo'
import { Input, Label } from '../components/fields'
import Segmented from '../components/Segmented'
import GoogleIcon from '../components/GoogleIcon'

type Mode = 'signin' | 'signup' | 'forgot'

export default function LoginPage() {
  const { session, loading: sessionLoading } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [googleEnabled, setGoogleEnabled] = useState(false)
  useEffect(() => {
    getAuthProviders().then((p) => setGoogleEnabled(!!p.google))
  }, [])
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
    <div className="bg-bg">
      <div className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-[480px] flex-col px-6">
        <div className="flex flex-1 flex-col justify-center pt-10 pb-8">
          <span className="mb-6 text-text">
            <ConfiaLogo size={52} />
          </span>
          <h1 className="font-display text-[2.375rem] leading-[1.1] font-semibold tracking-[-0.035em]">
            {mode === 'forgot' ? 'Reset your password' : 'Remember every conversation.'}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-text-muted">
            {mode === 'forgot'
              ? "We'll email you a link to set a new password."
              : 'Your people, notes and follow-ups — captured by voice, organised for you.'}
          </p>
        </div>

        <div className="pb-8">
          {mode !== 'forgot' && !signupDone && googleEnabled && (
            <Segmented
              className="mb-5"
              value={mode}
              onChange={(m) => switchMode(m)}
              options={[
                { value: 'signin', label: 'Sign in' },
                { value: 'signup', label: 'Create account' },
              ]}
            />
          )}

          {mode === 'forgot' && resetSent ? (
            <p className="rounded-2xl bg-bg-elevated p-4 text-[0.9375rem] text-text-muted">
              Check <span className="font-medium text-text">{email}</span> for a link to reset your password.
            </p>
          ) : signupDone ? (
            <p className="rounded-2xl bg-bg-elevated p-4 text-[0.9375rem] text-text-muted">
              Almost there — check <span className="font-medium text-text">{email}</span> for a confirmation link,
              then sign in.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
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
                  className="pressable -mt-1 self-end py-1 text-sm font-medium text-link"
                >
                  Forgot password?
                </button>
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button type="submit" variant="primary" size="lg" block disabled={submitting} className="mt-1">
                {submitting
                  ? 'Please wait…'
                  : mode === 'signin'
                    ? 'Sign in'
                    : mode === 'signup'
                      ? 'Create account'
                      : 'Send reset link'}
              </Button>
            </form>
          )}

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="pressable mt-4 w-full py-2 text-center text-[0.9375rem] font-medium text-link"
            >
              Back to sign in
            </button>
          )}

          {mode !== 'forgot' && !signupDone && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border-strong" />
                <span className="text-[0.8125rem] text-text-faint">or</span>
                <div className="h-px flex-1 bg-border-strong" />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                block
                disabled={googleSubmitting}
                onClick={handleGoogleSignIn}
              >
                <GoogleIcon size={18} />
                {googleSubmitting ? 'Redirecting…' : 'Continue with Google'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
