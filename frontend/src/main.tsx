import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import App from './App'
import { installErrorReporting } from './lib/errorReporting'
import { toast } from './components/Toast'
import './styles/index.css'

// Render's free tier spins the backend down after ~15 min idle, and the
// first request after that takes 30-60s to wake it back up (see
// PRODUCT_OVERVIEW.md's Limitations section). Firing a lightweight,
// unauthenticated health-check the instant this module loads - before
// auth even resolves, before the user has finished looking at the login
// screen - gives a cold backend a head start waking up while there's
// still something else happening on screen, instead of only starting to
// wake up on the user's first real data request. Fire-and-forget: the
// response (and any failure) is deliberately ignored, this is a
// best-effort warm-up the app never depends on succeeding.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
fetch(`${API_BASE_URL}/api/health`).catch(() => {})

installErrorReporting()

// A save that fails in the background (ticking a task, renaming an
// initiative...) used to just roll back silently. Any mutation that doesn't
// handle its own errors now says what went wrong - the backend's message
// names the part that failed and carries a reference code.
// Reads wait quietly while offline and refresh themselves on reconnect (the default). A change
// (tick a task, save a note) fails right away with a clear message instead of hanging.
const queryClient = new QueryClient({
  defaultOptions: { mutations: { networkMode: 'always' } },
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.options.onError || mutation.meta?.handlesOwnErrors) return
      toast(`Couldn't save that: ${error instanceof Error ? error.message : String(error)}`, 7000)
    },
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  </StrictMode>,
)
