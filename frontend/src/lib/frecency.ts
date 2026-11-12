import type { Interaction, Task } from '../api/types'
import { taskInitiativeId } from './taskOptions'

// How much a space is in use right now: every note and to-do added to it counts, newer ones count more (a half-life of
// two weeks), so a space you add to often AND recently floats to the top and one you stopped using sinks. Used to order
// the "Select a space" list. Keyed by space id; 0 = Others.
const HALF_LIFE_DAYS = 14
const DAY = 86_400_000

export function spaceScores(notes: Interaction[] | undefined, tasks: Task[] | undefined, now = Date.now()): Map<number, number> {
  const scores = new Map<number, number>()
  const add = (id: number | null | undefined, when: string | null | undefined) => {
    const t = when ? Date.parse(when) : NaN
    if (Number.isNaN(t)) return
    const ageDays = Math.max(0, (now - t) / DAY)
    const key = id ?? 0
    scores.set(key, (scores.get(key) ?? 0) + Math.pow(0.5, ageDays / HALF_LIFE_DAYS))
  }
  for (const n of notes ?? []) add(n.initiative_id, n.created_at)
  for (const t of tasks ?? []) add(taskInitiativeId(t), t.created_at)
  return scores
}
