import { useSyncExternalStore } from 'react'

// The initiative the user is focused on. null = All, -1 = Others (no initiative), else an initiative id.
export type InitiativeFilter = null | -1 | number

// Two independent focuses: the spaces / notes screens share one (opening a space there sets it), and Today has its
// own - so opening a space on the Notes tab no longer quietly narrows what Today shows.
export type FilterScope = 'spaces' | 'today'

function makeStore(key: string) {
  const listeners = new Set<() => void>()
  function read(): InitiativeFilter {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return null
      const n = Number(raw)
      return Number.isInteger(n) && (n === -1 || n > 0) ? n : null
    } catch {
      return null
    }
  }
  let current: InitiativeFilter = read()
  return {
    get: () => current,
    set(value: InitiativeFilter) {
      current = value
      try {
        if (value === null) localStorage.removeItem(key)
        else localStorage.setItem(key, String(value))
      } catch {
        // Private mode etc. - the choice still holds for this session.
      }
      listeners.forEach((l) => l())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const stores: Record<FilterScope, ReturnType<typeof makeStore>> = {
  spaces: makeStore('confia.initiativeFilter'),
  today: makeStore('confia.todayFilter'),
}

export function setInitiativeFilter(value: InitiativeFilter, scope: FilterScope = 'spaces') {
  stores[scope].set(value)
}

export function useInitiativeFilter(scope: FilterScope = 'spaces'): [InitiativeFilter, (value: InitiativeFilter) => void] {
  const store = stores[scope]
  const value = useSyncExternalStore(store.subscribe, store.get)
  return [value, store.set]
}

/** Whether something tagged with `initiativeId` (null = none) passes the filter. */
export function matchesInitiative(filter: InitiativeFilter, initiativeId: number | null | undefined): boolean {
  if (filter === null) return true
  if (filter === -1) return initiativeId == null
  return initiativeId === filter
}

/** A note's summary as short points. New notes store "- point" lines;
 * older ones are a 1-3 sentence paragraph, split into sentences. */
export function notePoints(summary: string | null | undefined): string[] {
  const text = (summary ?? '').trim()
  if (!text) return []
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.some((l) => /^[-•*]\s/.test(l))) return lines.map((l) => l.replace(/^[-•*]\s+/, ''))
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“'])/).map((s) => s.trim()).filter(Boolean)
}
