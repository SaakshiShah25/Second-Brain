import { describe, expect, it } from 'vitest'
import type { Task } from '../api/types'
import { byDue, itemInitiativeId, itemPath, repeatLabel } from './items'

const task = (over: Partial<Task>): Task =>
  ({ id: 1, interaction_id: null, description: 'x', due_date: null, status: 'open', owner: 'me', created_at: '', ...over }) as Task

describe('items', () => {
  it('labels repeats the way people say them', () => {
    expect(repeatLabel('daily')).toBe('Every day')
    expect(repeatLabel('hours:2')).toBe('Every 2 hours')
    expect(repeatLabel('hours:7')).toBe('Every 7 hours')
    expect(repeatLabel(null)).toBe('')
  })

  it('links an item to its own list, or the main Tasks list', () => {
    expect(itemPath(4, 9)).toBe('/lists/4?open=9')
    expect(itemPath(null, 9)).toBe('/tasks?open=9')
    expect(itemPath(null)).toBe('/tasks')
  })

  it('takes an item’s own category before its note’s', () => {
    const fromNote = { id: 7, date: null, summary: null, initiative: { id: 2, name: 'Work' } }
    expect(itemInitiativeId(task({ initiative_id: 3, interaction: fromNote }))).toBe(3)
    expect(itemInitiativeId(task({ interaction: fromNote }))).toBe(2)
    expect(itemInitiativeId(task({}))).toBeNull()
  })

  it('sorts by date, then time, undated last', () => {
    const items = [
      task({ id: 1 }),
      task({ id: 2, due_date: '2026-11-03', due_time: '18:00' }),
      task({ id: 3, due_date: '2026-11-03', due_time: '09:00' }),
      task({ id: 4, due_date: '2026-11-02' }),
    ]
    expect(items.sort(byDue).map((t) => t.id)).toEqual([4, 3, 2, 1])
  })
})
