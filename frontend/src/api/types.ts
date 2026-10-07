// Mirrors api/schemas.py + the response shapes verified live against the
// Phase 1 API (see the plan/README for the endpoint list these map to).

export interface PersonalNoteEntry {
  date: string
  note: string
}

export interface Person {
  id: number
  name: string
  aliases: string[]
  description: string
  // Personal/non-professional details (family, hobbies, interests) - a
  // dated timeline, not a single blob, so a point-in-time fact (a
  // pregnancy) can be told apart from a permanent one (hometown) and
  // judged for staleness later. Kept separate from `description` so
  // briefings can draw on them without mixing personal and professional
  // traits together.
  personal_notes: PersonalNoteEntry[]
  role: string
  company: string
  tags: string[]
  first_met_date: string | null
  created_at: string
  phone: string
  email: string
  // Absent until schema.sql section 28 has been run
  important_dates?: ImportantDate[]
}

// A recurring occasion on a person's profile - a birthday or anniversary
// that comes round every year (see important_dates.py on the backend).
// `year` is only ever a birth/start year the note actually stated.
export interface ImportantDate {
  label: string
  month: number
  day: number
  year: number | null
}

// One entry of GET /api/people/upcoming-dates - already resolved to the
// next occurrence, with the distance to it worked out server-side.
export interface UpcomingDate {
  person_id: number
  person_name: string
  label: string
  month: number
  day: number
  date: string
  days_until: number
  turning: number | null
}

export interface StalePerson extends Person {
  last_interaction_date: string
  days_ago: number
}

export interface CompanyGroup {
  company: string
  people: { id: number; name: string; role: string }[]
}

// GET /api/people/companies/{company}/overview - who you know at a company
// and how much you've talked to them. All exact counts/dates, no AI.
export interface CompanyOverview {
  company: string
  people: {
    id: number
    name: string
    role: string
    interaction_count: number
    last_interaction_date: string | null
  }[]
  interaction_count: number
  first_interaction_date: string | null
  last_interaction_date: string | null
  recent_interactions: { id: number; date: string | null; summary: string; person: { id: number; name: string } }[]
}

export type TaskOwner = 'me' | 'them'

export interface Task {
  id: number
  interaction_id: number
  description: string
  due_date: string | null
  status: 'open' | 'done'
  owner: TaskOwner
  created_at: string
  calendar_event_id: string | null
  interaction?: {
    id: number
    date: string | null
    summary: string | null
    person: { id: number; name: string } | null
    initiative: { id: number; name: string } | null
  } | null
  // Who this SPECIFIC task is about, when that's someone other than the
  // interaction's primary person (e.g. a note involving two people, where
  // this follow-up is for the secondary one) - null means "use the
  // interaction's primary person" (interaction.person above), the
  // pre-existing default. Prefer this field over interaction.person when
  // both are present.
  person?: { id: number; name: string } | null
}

export interface TaskCounts {
  overdue: number
  due_soon: number
  open: number
  done: number
}

export interface TasksResponse {
  tasks: Task[]
  counts: TaskCounts
}

export type TaskFilter = 'overdue' | 'due_soon' | 'open' | 'done' | 'all'

export interface SentimentEntry {
  topic: string
  sentiment: string
}

// ---------- Initiatives (user-managed note categories) ----------

export interface Initiative {
  id: number
  name: string
  color: string | null
  created_at: string
}

export interface Interaction {
  id: number
  person_id: number | null // null for a standalone note not about any specific person
  initiative_id: number | null // which user-managed initiative this note belongs to, if any - null = Uncategorized
  // Only present on GET /api/notes' joined response (not on a person's
  // own interaction list, which is inherently already scoped to them).
  person?: { id: number; name: string } | null
  initiative?: { id: number; name: string; color: string | null } | null
  raw_text: string
  date: string | null
  location: string | null
  appearance: string
  summary: string
  sentiment: SentimentEntry[]
  topics: string[]
  extracted_facts: {
    other_people?: { name: string; relation: string }[]
    opinions_expressed?: string[]
  }
  created_at: string
  tasks?: Task[]
  // Opt-in device location captured at logging time (see ChatInput.tsx) -
  // distinct from `location` above, which is whatever the note's TEXT says.
  geo_lat: number | null
  geo_lng: number | null
  geo_address: string | null
  maps_url: string | null
  decisions: string[]
  concerns: string[]
}

export interface SecondaryMention {
  relation: string
  interaction: {
    id: number
    date: string | null
    summary: string | null
    raw_text?: string
    location?: string | null
    appearance?: string
    // null when the primary note itself was person-less (a personal
    // task/reminder that merely named this person in passing, not an
    // interaction with anyone) - this person is still "mentioned in" it,
    // there's just no primary person to attribute the note to.
    person: { id: number; name: string } | null
  }
}

export interface PersonDetailResponse {
  person: Person
  interactions: Interaction[]
  mentioned_in: SecondaryMention[]
}

export interface Candidate {
  person: Person
  score: number
}

export interface ExtractedPrimaryPerson {
  name: string
  description?: string
  personal_notes?: string
  role?: string
  company?: string
  phone?: string
  email?: string
  aliases?: string[]
}

export interface ExtractedNote {
  primary_person: ExtractedPrimaryPerson | null // null = a standalone note, no person involved at all
  initiative?: string | null // the initiative name the LLM classified this note into, or null
  other_people?: { name: string; relation: string }[]
  date_mentioned: string | null
  location: string | null
  appearance_this_meeting?: string
  summary: string
  sentiments?: SentimentEntry[]
  topics?: string[]
  opinions_expressed?: string[]
  concerns?: string[]
  decisions?: string[]
  follow_ups?: { description: string; due_date: string | null; owner?: TaskOwner }[]
}

export interface CaptureSavedResult {
  status: 'saved'
  person_id: number | null
  resolved_name: string | null
  created_new: boolean
  interaction_id: number
  initiative_id: number | null
  // Only ever set when initiative_id is null - a proposed name for a new
  // initiative this note seems to be about, for the frontend to offer as
  // "add this as a new initiative?" (see ChatPage.tsx).
  suggested_initiative: string | null
  // The existing initiative this note WAS tagged with, by name - null
  // means Uncategorized. Mutually exclusive with suggested_initiative
  // (extraction.py never sets both for the same note).
  initiative_name: string | null
  summary: string
  tasks_created: { description: string; due_date: string | null; owner: TaskOwner }[]
  date_warning: string | null
  skipped_due_dates: { description: string; raw_due_date: string }[]
  geo_address: string | null
  maps_url: string | null
  decisions: string[]
  concerns: string[]
}

export interface CaptureConfirmRequiredResult {
  status: 'confirm_required'
  extracted: ExtractedNote
  raw_text: string
  interaction_date: string
  date_warning: string | null
  initiative_id: number | null
  candidates: Candidate[]
  geo_lat: number | null
  geo_lng: number | null
}

export type CaptureResult = CaptureSavedResult | CaptureConfirmRequiredResult

export interface CardFields {
  name: string
  role: string
  company: string
  phone: string
  email: string
}

// A note an answer was drawn from - a trimmed one-line summary only, never
// the full note text (see retrieval.build_sources).
export interface AnswerSource {
  id: number
  date: string | null
  summary: string
  person: { id: number; name: string } | null
  // true when this note is about someone else and only MENTIONED the
  // person the question was about
  secondary: boolean
}

export interface AskAnsweredResult {
  status: 'answered'
  answer: string
  sources?: AnswerSource[]
  // How many notes the answer actually used - can exceed sources.length,
  // since only the newest few are listed
  sources_total?: number
}

export interface AskConfirmRequiredResult {
  status: 'confirm_required'
  query: string
  parsed: Record<string, unknown>
  candidates: Candidate[]
}

export type AskResult = AskAnsweredResult | AskConfirmRequiredResult

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  // Marks a message as AI-generated content: 'answer' = a reply to a
  // question, 'capture' = the summary of a note it just saved. Only these
  // carry the "AI-generated" notice and the Report control. 'notice' is
  // the opposite: a message about something that didn't work (nothing
  // heard, mic blocked, a request that didn't go through) - shown in its
  // own alert style so it can't be mistaken for an answer, and never sent
  // back to the model as conversation history.
  kind?: 'answer' | 'capture' | 'notice'
  sources?: AnswerSource[]
  sourcesTotal?: number
}

// ---------- Unified chat (single thread, no mode tabs) ----------
// POST /api/chat classifies each message as capture-intent, ask-intent,
// or "blocked" (failed the moderation check, or out of scope for what
// this product does - a joke/story/code request, not a note or a
// question about the user's own data) - see api/routers/chat.py's
// docstring.

export type ChatCaptureResult = { intent: 'capture' } & CaptureResult
export type ChatAskResult = { intent: 'ask' } & AskResult
export interface ChatBlockedResult {
  intent: 'blocked'
  status: 'answered'
  reason: 'unsafe' | 'out_of_scope'
  answer: string
}
export type ChatResult = ChatCaptureResult | ChatAskResult | ChatBlockedResult

// ---------- Settings (theme, font size, Terms of Service) ----------

export type Theme = 'dark' | 'light'
export type FontSize = 'small' | 'default' | 'large'

export interface UserPreference {
  user_id: string
  theme: Theme
  font_size: FontSize
  terms_accepted_at: string | null
  daily_brief_email_enabled: boolean
  tour_completed_at: string | null
  updated_at: string
}

// ---------- Morning brief ----------

export interface MorningBrief {
  brief: string
}
