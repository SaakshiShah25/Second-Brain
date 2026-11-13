// The Spaces search. Forgiving on purpose: capitals and accents don't matter ("cafe" finds "Café"), every word you
// type must appear somewhere in the thing (in any order, in any of its fields), and a word only has to START a word
// or sit inside one ("pric" finds "pricing"). So "rahul invoice" finds a to-do "Send invoice" in the space "Rahul".
// Typos are forgiven too: a word of 4-6 letters may be one slip off ("pricng", "mivie"), 7 or more two slips.

export const fold = (s: string | null | undefined): string => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function tokens(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean)
}

// Edits (insert, delete, change, or swap two neighbours) needed to turn a into b.
function distance(a: string, b: string): number {
  const prev2: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1)
      row[j] = d
    }
    prev2.splice(0, prev2.length, ...prev)
    prev = row
  }
  return prev[b.length]
}

const allowedSlips = (len: number) => (len >= 7 ? 2 : len >= 4 ? 1 : 0)

/** True when `word` is a typo of (the start of) some word in the text. Words under 4 letters must match exactly. */
function closeTo(word: string, haystack: string): boolean {
  const slips = allowedSlips(word.length)
  if (!slips) return false
  for (const h of new Set(haystack.split(/[^a-z0-9]+/))) {
    if (h.length < word.length - slips) continue
    // The whole word, or just its beginning (someone typing "pricn" on the way to "pricing").
    if (distance(word, h) <= slips || (h.length > word.length && distance(word, h.slice(0, word.length)) <= slips)) return true
  }
  return false
}

/** True when every word of the query is found (or nearly found) in at least one of the fields. */
export function matchesAll(words: string[], fields: (string | null | undefined)[]): boolean {
  if (words.length === 0) return false
  const haystack = fold(fields.filter(Boolean).join(' \n '))
  return words.every((w) => haystack.includes(w) || closeTo(w, haystack))
}

/** Higher = better: used to put the best matches first (a name that starts with the query beats one that only contains it). */
export function rank(words: string[], title: string | null | undefined): number {
  const t = fold(title)
  const q = words.join(' ')
  if (t === q) return 3
  if (t.startsWith(q)) return 2
  return words.every((w) => t.includes(w)) ? 1 : 0
}
