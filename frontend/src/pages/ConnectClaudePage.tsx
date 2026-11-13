import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookOpen, ListChecks, Sparkles } from 'lucide-react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/Button'
import ConfiaLogo from '../components/ConfiaLogo'
import LoadingScreen from '../components/LoadingScreen'

// "Connect MyConfía to Claude": where Claude sends the person to say yes (api/routers/mcp_oauth.py). They are already
// signed in to MyConfía here (Google or email), so there is no password for anyone else to ask for - the page only asks
// whether to let the app that is asking in, then sends the browser back to it with a one-time code.
interface RequestInfo {
  client_name: string
  redirect_host: string
}

export default function ConnectClaudePage() {
  const [params] = useSearchParams()
  const request = params.get('request') ?? ''
  const { user, signOut } = useAuth()
  const [info, setInfo] = useState<RequestInfo | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'allow' | 'cancel' | null>(null)

  useEffect(() => {
    if (!request) {
      setError('This link is missing its sign-in request. Start again from Claude.')
      return
    }
    api
      .get<RequestInfo>(`/mcp/oauth/request?request=${encodeURIComponent(request)}`)
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : 'This sign-in request has expired - start again from Claude.'))
  }, [request])

  async function answer(approve: boolean) {
    setBusy(approve ? 'allow' : 'cancel')
    try {
      const { redirect } = await api.post<{ redirect: string }>('/mcp/oauth/approve', { request, approve })
      window.location.assign(redirect) // back to Claude, with the code (or the refusal)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't finish - please try again from Claude.")
      setBusy(null)
    }
  }

  if (!info && !error) return <LoadingScreen />

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-5 py-10 text-text">
      <div className="w-full max-w-md rounded-3xl border border-border bg-bg-card p-6 shadow-card">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <ConfiaLogo size={28} />
        </span>
        {error ? (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Can't connect</h1>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-text-muted">{error}</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Connect {info!.client_name} to MyConfía?</h1>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-text-muted">
              {info!.client_name} (from {info!.redirect_host}) is asking to use your MyConfía as <span className="font-medium text-text">{user?.email}</span>. If you allow it, it can:
            </p>
            <ul className="mt-4 flex flex-col gap-3 text-[0.9375rem]">
              <li className="flex items-start gap-3">
                <ListChecks size={19} strokeWidth={2} className="mt-0.5 flex-shrink-0 text-accent" />
                <span>Read and change your to-dos, due dates, reminders, lists and spaces</span>
              </li>
              <li className="flex items-start gap-3">
                <BookOpen size={19} strokeWidth={2} className="mt-0.5 flex-shrink-0 text-accent" />
                <span>Read and add notes</span>
              </li>
              <li className="flex items-start gap-3">
                <Sparkles size={19} strokeWidth={2} className="mt-0.5 flex-shrink-0 text-accent" />
                <span>Save things for you and answer questions from your notes</span>
              </li>
            </ul>
            <p className="mt-4 text-[0.8125rem] leading-relaxed text-text-faint">
              It will ask before deleting anything. You can disconnect it any time in Settings. Only allow this if you started the connection from Claude yourself.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button variant="primary" size="lg" block disabled={busy !== null} onClick={() => answer(true)}>
                {busy === 'allow' ? 'Connecting…' : 'Allow'}
              </Button>
              <Button variant="ghost" size="lg" block disabled={busy !== null} onClick={() => answer(false)}>
                Cancel
              </Button>
            </div>
            <button type="button" onClick={() => void signOut()} className="mt-4 w-full text-center text-[0.8125rem] text-text-faint underline">
              Not you? Sign out
            </button>
          </>
        )}
      </div>
    </div>
  )
}
