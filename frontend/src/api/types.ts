// Mirrors api/schemas.py + the response shapes of the FastAPI backend.

export type TaskOwner = 'me' | 'them'

export interface Task {
  id: number
  interaction_id: number
  description: string
  due_date: string | null
  due_time?: string | null // HH:MM(:SS), only when the deadline has a time of day
  status: 'open' | 'done'
  owner: TaskOwner
  created_at: string
  interaction?: {
    id: number
    date: string | null
    summary: string | null
    initiative: { id: number; name: string } | null
  } | null
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

// ---------- Initiatives (user-managed note categories) ----------

export interface Initiative {
  id: number
  name: string
  color: string | null
  created_at: string
}

export interface Interaction {
  id: number
  initiative_id: number | null // which user-managed initiative this note belongs to, if any - null = Uncategorized
  initiative?: { id: number; name: string; color: string | null } | null
  raw_text: string
  date: string | null
  location: string | null
  summary: string
  topics: string[]
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
  // Set when the note was logged: the topic label its points are grouped under on the initiative's page.
  extracted_facts?: { section?: string } | null
}

// One message can cover several subjects, so it is saved as one note per part, each under its own initiative
// (api/routers/capture.py). `parts` has one entry per note created.
export interface CapturePart {
  interaction_id: number
  initiative_id: number | null
  // Only ever set when initiative_id is null - a proposed name for a new initiative this part seems to be
  // about, for the frontend to offer as "add this as a new initiative?" (see ChatPage.tsx).
  suggested_initiative: string | null
  // The existing initiative this part WAS filed under, by name - null means Others.
  initiative_name: string | null
  summary: string
  tasks_created: { description: string; due_date: string | null; due_time?: string | null; owner: TaskOwner }[]
  skipped_due_dates: { description: string; raw_due_date: string }[]
  decisions: string[]
  concerns: string[]
}

export interface CaptureSavedResult {
  status: 'saved'
  parts: CapturePart[]
  date_warning: string | null
  skipped_due_dates: { description: string; raw_due_date: string }[]
  geo_address: string | null
  maps_url: string | null
}

export type CaptureResult = CaptureSavedResult

// One item the answer relied on (agent.py) - shown as a tappable chip.
export interface AnswerSource {
  ref: string
  kind: 'note' | 'task'
  id: number
  title: string
  date: string | null
}

export interface AskAnsweredResult {
  status: 'answered'
  answer: string
  sources?: AnswerSource[]
}

export type AskResult = AskAnsweredResult

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: AnswerSource[]
  // A short status line from the app itself ("Added X and tagged this note", an error) -
  // nothing worth copying, so it gets no copy button.
  status?: boolean
  // Set on the "that's not something I can help with" reply: the original text, so it can be
  // saved as a note instead with one tap.
  saveAsNote?: string
  // The structured reply to a logged note (rendered as coloured sections); `content` keeps a plain-text copy.
  capture?: CaptureSavedResult
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
  reason: 'unsafe' | 'out_of_scope' | 'unavailable'
  answer: string
}
export type ChatResult = ChatCaptureResult | ChatAskResult | ChatBlockedResult

// ---------- Settings (theme, font size, Terms of Service) ----------

export type Theme = 'dark' | 'light'
export type FontSize = 'small' | 'default' | 'large'
export type UsageMode = 'work' | 'personal' | 'both'

export interface UserPreference {
  user_id: string
  theme: Theme
  font_size: FontSize
  terms_accepted_at: string | null
  tour_completed_at: string | null
  // null = not asked yet (triggers the onboarding question). Absent
  // entirely (undefined) until schema.sql section 25 is applied - the
  // feature stays dormant then; see lib/usageMode.ts.
  usage_mode?: UsageMode | null
  updated_at: string
}
