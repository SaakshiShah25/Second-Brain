import type { Interaction, Person, Task } from '../api/types'

// Search runs on the device, not the server: note text, summaries and task
// descriptions are encrypted at rest in the database, so Postgres can't
// match against them - but the app already loads them decrypted for the
// Notes/Today/People pages, and at personal-notes scale filtering a few
// thousand rows in memory is instant.

/** Lowercases and strips accents so "Ramirez" finds "Ramírez". */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** "priya pricing" -> ["priya", "pricing"]. Every term has to be found. */
export function tokenize(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean)
}

export function matchesAll(haystack: string, terms: string[]): boolean {
  if (terms.length === 0) return false
  const h = normalize(haystack)
  return terms.every((t) => h.includes(t))
}

/** A short excerpt of `text` around the first matching term, so a result
 * can show WHY it matched when the match is buried in a long note. */
export function snippet(text: string, terms: string[], radius = 70): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const lower = normalize(flat)
  let at = -1
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i !== -1 && (at === -1 || i < at)) at = i
  }
  if (at === -1) return flat.slice(0, radius * 2)
  const start = Math.max(0, at - radius)
  const end = Math.min(flat.length, at + radius)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

// ---------- per-kind searching ----------
// Each returns matches best-first. "Best" is simply: a hit in the headline
// field (a name, a summary, a task's own text) outranks a hit that's only
// somewhere in the body, and ties go to the most recent.

function personText(p: Person): string {
  return [
    p.name,
    ...(p.aliases ?? []),
    p.role,
    p.company,
    p.description,
    p.email,
    p.phone,
    ...(p.tags ?? []),
    ...(p.personal_notes ?? []).map((n) => n.note),
    ...(p.important_dates ?? []).map((d) => d.label),
  ]
    .filter(Boolean)
    .join(' ')
}

export function searchPeople(people: Person[], terms: string[]): Person[] {
  return people
    .filter((p) => matchesAll(personText(p), terms))
    .map((p) => ({ p, headline: matchesAll([p.name, ...(p.aliases ?? [])].join(' '), terms) }))
    .sort((a, b) => Number(b.headline) - Number(a.headline) || a.p.name.localeCompare(b.p.name))
    .map(({ p }) => p)
}

function noteText(n: Interaction): string {
  return [
    n.summary,
    n.raw_text,
    n.location,
    n.person?.name,
    n.initiative?.name,
    ...(n.topics ?? []),
    ...(n.decisions ?? []),
    ...(n.concerns ?? []),
    ...(n.tasks ?? []).map((t) => t.description),
  ]
    .filter(Boolean)
    .join(' ')
}

export function searchNotes(notes: Interaction[], terms: string[]): Interaction[] {
  return notes
    .filter((n) => matchesAll(noteText(n), terms))
    .map((n) => ({ n, headline: matchesAll(`${n.summary ?? ''} ${n.person?.name ?? ''}`, terms) }))
    .sort(
      (a, b) =>
        Number(b.headline) - Number(a.headline) || (b.n.date ?? '').localeCompare(a.n.date ?? ''),
    )
    .map(({ n }) => n)
}

function taskText(t: Task): string {
  return [
    t.description,
    t.person?.name,
    t.interaction?.person?.name,
    t.interaction?.initiative?.name,
    t.interaction?.summary,
  ]
    .filter(Boolean)
    .join(' ')
}

export function searchTasks(tasks: Task[], terms: string[]): Task[] {
  return tasks
    .filter((t) => matchesAll(taskText(t), terms))
    .map((t) => ({ t, headline: matchesAll(t.description, terms) }))
    .sort(
      (a, b) =>
        Number(b.headline) - Number(a.headline) ||
        // open before done, then soonest due
        Number(a.t.status === 'done') - Number(b.t.status === 'done') ||
        (a.t.due_date ?? '9999').localeCompare(b.t.due_date ?? '9999'),
    )
    .map(({ t }) => t)
}
