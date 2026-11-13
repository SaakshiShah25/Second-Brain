import { useState } from 'react'

export type SpaceSection = 'notes' | 'todos' | 'lists'
const DEFAULT: SpaceSection[] = ['notes', 'todos', 'lists']

function read(key: string): SpaceSection[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (Array.isArray(saved) && saved.length === 3 && DEFAULT.every((s) => saved.includes(s))) return saved
  } catch {
    // unreadable - the default order
  }
  return DEFAULT
}

// The order of Notes / To-dos / Lists on one space's page, chosen in that space's edit mode. Kept on this device
// (per space), so it survives closing the app.
export function useSectionOrder(spaceId: number | null) {
  const key = `confia.sectionOrder.${spaceId ?? 'others'}`
  const [order, setOrder] = useState<SpaceSection[]>(() => read(key))
  function move(section: SpaceSection, by: -1 | 1) {
    const i = order.indexOf(section)
    const j = i + by
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // not remembered - fine
    }
  }
  return { order, move }
}
