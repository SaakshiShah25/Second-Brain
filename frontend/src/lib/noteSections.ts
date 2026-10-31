import type { Interaction } from '../api/types'
import { notePoints } from './initiativeFilter'

// Everything the Notes tab shows comes from what was extracted when the note was logged - no AI call
// when you open it. A note contributes its key points, decisions and concerns (each fact once), and
// an initiative's page groups them under the topic label the note was given at logging time.

export interface NoteItem {
  text: string
  kind?: 'decision' | 'concern'
  // Which note it came from and when that note is dated - so an item can point back to its note.
  noteId?: number
  date?: string | null
}

// A line that is an instruction TO THE APP ("Create a new initiative called Reading", "I decided to name the
// initiative 'Case Studies'") rather than part of the note. New notes don't keep these (text_utils.is_app_instruction
// on the server - keep the two in step); this also hides ones saved before that.
const LEAD = String.raw`^\s*(?:(?:i|we)\s+)?(?:(?:decided|decide|need|needs|want|wants|going|plan|plans|have|had|would\s+like|like)\s+(?:to\s+)?)*`
const MAKE = String.raw`(?:add|create|make|set\s+up|start)`
const ART = String.raw`(?:a\s+|an\s+|the\s+|my\s+)?(?:new\s+|another\s+)?`
const APP_INSTRUCTION = [
  new RegExp(`${LEAD}${MAKE}\\s+${ART}(?:task|reminder|to-?do)\\b`, 'i'),
  new RegExp(`${LEAD}${MAKE}\\s+${ART}(?:category|folder)\\b`, 'i'),
  new RegExp(`${LEAD}${MAKE}\\s+${ART}initiative\\s+(?:called|named|titled)\\b`, 'i'),
  new RegExp(`${LEAD}(?:name|call|rename|title)\\s+(?:the\\s+|this\\s+|my\\s+|a\\s+|an\\s+)?(?:new\\s+)?(?:initiative|category|folder)\\b`, 'i'),
]
export function isAppInstruction(text: string): boolean {
  return APP_INSTRUCTION.some((re) => re.test(text))
}

const STOP = new Set(
  ('a an the and or but if so of to in on at by for with from about into over as is are was were be been being am it its ' +
    'this that these those i me my we our you your he she him her his hers they them their there here not no do does did ' +
    'doing done have has had having will would can could should may might must just very also then than too some any all ' +
    'more most up out off need needs want wants get got').split(' '),
)

function contentWords(text: string): Set<string> {
  const out = new Set<string>()
  for (let w of text.toLowerCase().replace(/'s\b/g, '').match(/[a-z0-9]+/g) ?? []) {
    if (w.length < 3 || STOP.has(w)) continue
    for (const suffix of ['ing', 'ed', 'es', 's']) {
      if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
        w = w.slice(0, -suffix.length)
        break
      }
    }
    out.add(w)
  }
  return out
}

// Same idea as text_utils.is_restatement on the server: most of the shorter line's meaningful words are
// already in the other. Notes logged before duplicates were removed at extraction still repeat themselves.
export function restates(a: string, b: string): boolean {
  const wa = contentWords(a)
  const wb = contentWords(b)
  const smaller = Math.min(wa.size, wb.size)
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  // a very short line only counts as a repeat when every one of its words is in the other line
  if (smaller < 3) return smaller >= 2 && shared === smaller
  return shared / smaller >= 0.6
}

/** The note's own points, without any that merely restate one of its decisions or concerns. */
export function distinctPoints(n: Interaction): string[] {
  const others = [...(n.decisions ?? []), ...(n.concerns ?? [])]
  return notePoints(n.summary).filter((p) => !isAppInstruction(p) && !others.some((o) => restates(p, o)))
}

/** Points, then decisions, then concerns - every distinct fact of the note, once. */
export function noteItems(n: Interaction): NoteItem[] {
  return [
    ...distinctPoints(n).map((text): NoteItem => ({ text, noteId: n.id, date: n.date })),
    ...(n.decisions ?? []).filter((t) => !isAppInstruction(t)).map((text): NoteItem => ({ text, kind: 'decision', noteId: n.id, date: n.date })),
    ...(n.concerns ?? []).filter((t) => !isAppInstruction(t)).map((text): NoteItem => ({ text, kind: 'concern', noteId: n.id, date: n.date })),
  ]
}

export interface NoteSection {
  key: string
  title: string // '' = no heading (the only group, and it has no label)
  items: NoteItem[]
  // The same items by kind, in reading order: key points, then decisions, then concerns (empty kinds left out).
  groups: { kind: 'point' | 'decision' | 'concern'; label: string; items: NoteItem[] }[]
}

function byKind(items: NoteItem[]): NoteSection['groups'] {
  const groups: NoteSection['groups'] = [
    { kind: 'point', label: 'Key points', items: items.filter((i) => !i.kind) },
    { kind: 'decision', label: 'Decisions', items: items.filter((i) => i.kind === 'decision') },
    { kind: 'concern', label: 'Concerns', items: items.filter((i) => i.kind === 'concern') },
  ]
  return groups.filter((g) => g.items.length > 0)
}

/** How much an initiative holds, for its header: "4 notes · 3 decisions · 1 concern". */
export function noteCounts(notes: Interaction[]): string {
  const sections = noteSections(notes)
  const all = sections.flatMap((s) => s.items)
  const decisions = all.filter((i) => i.kind === 'decision').length
  const concerns = all.filter((i) => i.kind === 'concern').length
  const parts = [`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`]
  if (decisions) parts.push(`${decisions} ${decisions === 1 ? 'decision' : 'decisions'}`)
  if (concerns) parts.push(`${concerns} ${concerns === 1 ? 'concern' : 'concerns'}`)
  return parts.join(' · ')
}

/** An initiative's notes as sections: newest notes first, grouped by the topic label each was given. */
export function noteSections(notes: Interaction[]): NoteSection[] {
  const newestFirst = [...notes].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id)
  const groups = new Map<string, NoteSection>()
  for (const n of newestFirst) {
    const label = (n.extracted_facts?.section ?? '').trim()
    const key = label.toLowerCase()
    const group = groups.get(key) ?? groups.set(key, { key: key || 'other', title: label, items: [], groups: [] }).get(key)!
    for (const item of noteItems(n)) {
      if (!group.items.some((g) => g.kind === item.kind && g.text.toLowerCase() === item.text.toLowerCase())) group.items.push(item)
    }
  }
  const sections = [...groups.values()].filter((g) => g.items.length > 0)
  for (const s of sections) s.groups = byKind(s.items)
  // Unlabelled notes (older ones) come last, under "Other notes" when there is anything else to tell apart.
  const unlabelled = sections.filter((s) => s.title === '')
  const labelled = sections.filter((s) => s.title !== '')
  if (labelled.length > 0) for (const s of unlabelled) s.title = 'Other notes'
  return [...labelled, ...unlabelled]
}
