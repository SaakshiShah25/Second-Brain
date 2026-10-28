import { useSyncExternalStore } from 'react'

// The initiative the user is focused on, shared by Today and Notes - pick
// "Fitness" on one and the other is already narrowed to it, so the two
// screens read as one view of that initiative rather than two separate
// lists. null = All, -1 = Others (no initiative), else an initiative id.
export type InitiativeFilter = null | -1 | number

const KEY = 'confia.initiativeFilter'
const listeners = new Set<() => void>()

function read(): InitiativeFilter {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null
    const n = Number(raw)
    return Number.isInteger(n) && (n === -1 || n > 0) ? n : null
  } catch {
    return null
  }
}

let current: InitiativeFilter = read()

export function setInitiativeFilter(value: InitiativeFilter) {
  current = value
  try {
    if (value === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(value))
  } catch {
    // Private mode etc. - the choice still holds for this session.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useInitiativeFilter(): [InitiativeFilter, (value: InitiativeFilter) => void] {
  const value = useSyncExternalStore(subscribe, () => current)
  return [value, setInitiativeFilter]
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
