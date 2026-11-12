// The Spaces search. Forgiving on purpose: capitals and accents don't matter ("cafe" finds "Café"), every word you
// type must appear somewhere in the thing (in any order, in any of its fields), and a word only has to START a word
// or sit inside one ("pric" finds "pricing"). So "rahul invoice" finds a to-do "Send invoice" in the space "Rahul".

export const fold = (s: string | null | undefined): string => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function tokens(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean)
}

/** True when every word of the query is found in at least one of the fields. */
export function matchesAll(words: string[], fields: (string | null | undefined)[]): boolean {
  if (words.length === 0) return false
  const haystack = fold(fields.filter(Boolean).join(' \n '))
  return words.every((w) => haystack.includes(w))
}

/** Higher = better: used to put the best matches first (a name that starts with the query beats one that only contains it). */
export function rank(words: string[], title: string | null | undefined): number {
  const t = fold(title)
  const q = words.join(' ')
  if (t === q) return 3
  if (t.startsWith(q)) return 2
  return words.every((w) => t.includes(w)) ? 1 : 0
}
