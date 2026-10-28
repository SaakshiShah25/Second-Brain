// The user's own order for initiatives. Saved on the server
// (initiative.position, via useReorderInitiatives) and also on this device,
// so it works even before the database has the column.
const ORDER_KEY = 'confia.initiativeOrder'

export function saveLocalOrder(ids: number[]) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(ids))
  } catch {
    // the server copy still holds it
  }
}

/** `list` in the saved order. Ones not in it (new) keep their own order, after the rest. */
export function applyLocalOrder<T extends { id: number }>(list: T[]): T[] {
  let order: unknown = []
  try {
    order = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]')
  } catch {
    return list
  }
  if (!Array.isArray(order) || order.length === 0) return list
  const rank = new Map(order.map((id, i) => [id as number, i]))
  return list
    .map((item, i) => ({ item, key: rank.get(item.id) ?? order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item)
}
