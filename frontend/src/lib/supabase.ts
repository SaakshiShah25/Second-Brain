import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set - see frontend/.env.development',
  )
}

// Where the signed-in session is kept. iPhones can empty a home-screen app's localStorage (storage pressure, an OS
// update) while the app itself stays installed, and the person is then "logged out" for no reason. So the session is
// written to IndexedDB as well, and restored from it when localStorage comes back empty.
const IDB_NAME = 'confia-auth'
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function idbDo<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await idbOpen()
    return await new Promise<T | null>((resolve) => {
      const req = run(db.transaction('kv', mode).objectStore('kv'))
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null // private mode, blocked storage: localStorage alone then
  }
}
const sessionStorageBackup = {
  async getItem(key: string): Promise<string | null> {
    try {
      const v = localStorage.getItem(key)
      if (v !== null) {
        void idbDo('readwrite', (s) => s.put(v, key))
        return v
      }
    } catch {
      // localStorage unavailable - fall through to the copy
    }
    const copy = await idbDo<string>('readonly', (s) => s.get(key))
    if (copy) {
      try {
        localStorage.setItem(key, copy)
      } catch {
        // still readable from the copy next time
      }
    }
    return copy
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value)
    } catch {
      // the copy below still holds it
    }
    await idbDo('readwrite', (s) => s.put(value, key))
  },
  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key)
    } catch {
      // nothing to remove
    }
    await idbDo('readwrite', (s) => s.delete(key))
  },
}

export const supabase = createClient(url, anonKey, {
  auth: { storage: sessionStorageBackup, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

// Ask the browser not to clear this app's storage under pressure (honoured by installed apps).
void navigator.storage?.persist?.().catch(() => {})

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
