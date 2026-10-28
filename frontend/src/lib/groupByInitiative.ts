import type { Initiative } from '../api/types'

export interface InitiativeGroup<T> {
  key: string
  name: string
  initiative: Initiative | null // null = "Others" (no category)
  items: T[]
}

/** Items grouped under their category, in the order the user's categories are listed, with
 * "Others" (no category, or one that no longer exists) last. Empty groups are left out. */
export function groupByInitiative<T>(
  items: T[],
  initiatives: Initiative[],
  getInitiativeId: (item: T) => number | null | undefined,
): InitiativeGroup<T>[] {
  const byId = new Map<number, T[]>()
  const others: T[] = []
  const known = new Set(initiatives.map((i) => i.id))
  for (const item of items) {
    const id = getInitiativeId(item)
    if (id != null && known.has(id)) byId.set(id, [...(byId.get(id) ?? []), item])
    else others.push(item)
  }
  const groups: InitiativeGroup<T>[] = initiatives
    .filter((i) => byId.has(i.id))
    .map((i) => ({ key: String(i.id), name: i.name, initiative: i, items: byId.get(i.id)! }))
  if (others.length > 0) groups.push({ key: 'others', name: 'Others', initiative: null, items: others })
  return groups
}
