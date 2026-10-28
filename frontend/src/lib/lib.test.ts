import { beforeEach, describe, expect, it } from 'vitest'
import { matchesInitiative, notePoints } from './initiativeFilter'
import { applyLocalOrder, saveLocalOrder } from './initiativeOrder'
import {
  PICKABLE_INITIATIVE_COLORS,
  colorForNewInitiative,
  getInitiativeStyle,
  setKnownInitiatives,
} from './initiativeStyle'

// A Map-backed localStorage for Node.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

describe('notePoints - a note shown as short points', () => {
  it('reads "- " bullet lines (new notes)', () => {
    expect(notePoints('- Liked the pricing\n- Wants a usage tier\n• Annual stays')).toEqual([
      'Liked the pricing',
      'Wants a usage tier',
      'Annual stays',
    ])
  })
  it('splits an old paragraph summary into sentences', () => {
    expect(notePoints('Met Priya. She liked it! Next: send the deck.')).toEqual([
      'Met Priya.',
      'She liked it!',
      'Next: send the deck.',
    ])
  })
  it('does not split on decimals or abbreviations mid-sentence', () => {
    expect(notePoints('Comps trade at 2.5x revenue and DCF gives ₹1,350 Cr.')).toEqual([
      'Comps trade at 2.5x revenue and DCF gives ₹1,350 Cr.',
    ])
  })
  it('handles empty input', () => {
    expect(notePoints('')).toEqual([])
    expect(notePoints(null)).toEqual([])
    expect(notePoints('   ')).toEqual([])
  })
})

describe('matchesInitiative - the shared Today/Notes filter', () => {
  it('All shows everything', () => {
    expect(matchesInitiative(null, 3)).toBe(true)
    expect(matchesInitiative(null, null)).toBe(true)
  })
  it('Others shows only untagged', () => {
    expect(matchesInitiative(-1, null)).toBe(true)
    expect(matchesInitiative(-1, undefined)).toBe(true)
    expect(matchesInitiative(-1, 3)).toBe(false)
  })
  it('an initiative shows only its own', () => {
    expect(matchesInitiative(3, 3)).toBe(true)
    expect(matchesInitiative(3, 4)).toBe(false)
    expect(matchesInitiative(3, null)).toBe(false)
  })
})

describe('initiative colours - every initiative distinguishable', () => {
  const ini = (id: number, name: string, color: string | null = null) => ({ id, name, color })

  it('gives twelve unsaved initiatives twelve different colours', () => {
    const list = Array.from({ length: 12 }, (_, i) => ini(i + 1, `Project ${i}`))
    setKnownInitiatives(list)
    const colors = list.map((i) => getInitiativeStyle(i)!.color)
    expect(new Set(colors).size).toBe(12)
  })
  it('keeps a saved colour and avoids it for the others', () => {
    const list = [ini(1, 'IC case study', '#7c5cd8'), ini(2, 'Fixed income learning'), ini(3, 'Interview prep')]
    setKnownInitiatives(list)
    const colors = list.map((i) => getInitiativeStyle(i)!.color)
    expect(colors[0]).toBe('#7c5cd8')
    expect(new Set(colors).size).toBe(3)
  })
  it('matches by name when only the name is known (calendar entries)', () => {
    setKnownInitiatives([ini(1, 'Work'), ini(2, 'Fitness')])
    expect(getInitiativeStyle({ name: 'fitness' })!.color).toBe(getInitiativeStyle(ini(2, 'Fitness'))!.color)
  })
  it('picks an unused colour for a new initiative', () => {
    const existing = PICKABLE_INITIATIVE_COLORS.slice(0, 5).map((c, i) => ini(i + 1, `x${i}`, c))
    expect(PICKABLE_INITIATIVE_COLORS.slice(0, 5)).not.toContain(colorForNewInitiative('Something new', existing))
  })
  it('prefers the keyword colour while it is free', () => {
    expect(colorForNewInitiative('Fitness', [])).toBe('#1f9d6b')
    expect(colorForNewInitiative('Fitness', [ini(1, 'Gym', '#1f9d6b')])).not.toBe('#1f9d6b')
  })
  it('Others has no colour', () => {
    expect(getInitiativeStyle(null)).toBeNull()
  })
})

describe('initiative order - the user decides', () => {
  beforeEach(() => store.clear())
  const list = [{ id: 1 }, { id: 2 }, { id: 3 }]

  it('keeps the server order when nothing is saved', () => {
    expect(applyLocalOrder(list).map((x) => x.id)).toEqual([1, 2, 3])
  })
  it('applies the saved order', () => {
    saveLocalOrder([3, 1, 2])
    expect(applyLocalOrder(list).map((x) => x.id)).toEqual([3, 1, 2])
  })
  it('puts new initiatives after the ordered ones', () => {
    saveLocalOrder([2, 1])
    expect(applyLocalOrder([...list, { id: 9 }]).map((x) => x.id)).toEqual([2, 1, 3, 9])
  })
  it('survives corrupt storage', () => {
    store.set('confia.initiativeOrder', '{not json')
    expect(applyLocalOrder(list).map((x) => x.id)).toEqual([1, 2, 3])
  })
})
