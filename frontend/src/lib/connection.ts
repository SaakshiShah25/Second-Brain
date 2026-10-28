import { useSyncExternalStore } from 'react'

// What the app knows about its connection:
//   offline      - the browser says there is no network at all (airplane mode, data off)
//   unreachable  - the browser thinks it is online, but a request to our server just got no answer at all
//                  (Wi-Fi with no internet, or the free server still waking up). We then check the
//                  server's health address every few seconds until it answers.
export interface ConnectionState {
  offline: boolean
  unreachable: boolean
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const RECHECK_MS = 4000

let state: ConnectionState = { offline: typeof navigator !== 'undefined' && navigator.onLine === false, unreachable: false }
const listeners = new Set<() => void>()
let recheckTimer: number | undefined

function set(next: Partial<ConnectionState>) {
  const merged = { ...state, ...next }
  if (merged.offline === state.offline && merged.unreachable === state.unreachable) return
  state = merged
  listeners.forEach((l) => l())
}

async function recheck() {
  recheckTimer = undefined
  if (!state.unreachable) return
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { cache: 'no-store' })
    if (res.ok) {
      set({ unreachable: false })
      return
    }
  } catch {
    // still unreachable
  }
  recheckTimer = window.setTimeout(recheck, RECHECK_MS)
}

// Called by the API client when a request got no answer at all.
export function reportUnreachable() {
  if (state.offline) return // the browser already says why
  set({ unreachable: true })
  if (recheckTimer === undefined) recheckTimer = window.setTimeout(recheck, RECHECK_MS)
}

// Called by the API client when any request got an answer - the server is clearly reachable.
export function reportReachable() {
  if (state.unreachable) set({ unreachable: false })
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => set({ offline: true }))
  window.addEventListener('online', () => {
    set({ offline: false })
    if (state.unreachable) {
      window.clearTimeout(recheckTimer)
      recheck()
    }
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useConnection(): ConnectionState {
  return useSyncExternalStore(subscribe, () => state)
}

export function isOffline(): boolean {
  return state.offline || state.unreachable
}
