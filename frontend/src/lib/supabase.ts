import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set - see frontend/.env.development',
  )
}

export const supabase = createClient(url, anonKey)

// Which sign-in providers this Supabase project has switched on (public
// endpoint) - lets the login screen hide "Continue with Google" until
// Google is actually enabled, instead of showing a button that lands on
// Supabase's "provider is not enabled" error page.
let providers: Promise<Record<string, boolean>> | null = null
export function getAuthProviders() {
  providers ??= fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } })
    .then((r) => (r.ok ? r.json() : { external: {} }))
    .then((s) => (s.external ?? {}) as Record<string, boolean>)
    .catch(() => ({}))
  return providers
}
