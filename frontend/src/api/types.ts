// Mirrors api/schemas.py + the response shapes of the FastAPI backend.

export type TaskOwner = 'me' | 'them'

// daily | weekdays | weekly | monthly | yearly | hours:N (an "every N hours" routine)
export type Repeat = string

// A named pile of items - Movies, Books, Groceries, Birthdays. The main Tasks list is not one of
// these: it's every item whose list_id is null.
export interface ItemList {
  id: number
  name: string
  emoji: string | null
  position: number | null
  created_at: string
  initiative_id?: number | null // the space it lives in (needs migration 43); null = none yet
}

// Every to-do and list entry is a Task (an "item").
export interface Task {
  id: number
  interaction_id: number | null // the note it came from; null for an item captured on its own
  description: string
  due_date: string | null
  due_time?: string | null // HH:MM(:SS), only when the deadline has a time of day
  status: 'open' | 'done'
  owner: TaskOwner
  // The next three exist once scripts/migration_38_task_options.sql has run.
  priority?: 'high' | 'normal' | 'low'
  remind_on?: string | null // the day (YYYY-MM-DD) to get a push about this task
  remind_time?: string | null // HH:MM(:SS) that day; null = 9 AM (needs migration 41)
  remind_before?: number | null // minutes before the due time to be reminded (needs migration 45)
  initiative_id?: number | null // the task's own category (it can be moved without moving its note); null = Others
  // The next four exist once scripts/migration_40_lists.sql has run.
  list_id?: number | null
  item_list?: { id: number; name: string; emoji: string | null } | null
  repeat?: Repeat | null
  detail?: string | null
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
  // One message that touched several initiatives is saved as one note per initiative; the first holds the
  // original text and the rest point at it (`source_id`). `raw_text` is already filled in from it. `also_in` names
  // the other initiatives the same message went to, and `shared_original` is true when deleting this note also
  // deletes those others.
  source_id?: number | null
  also_in?: string[]
  shared_original?: boolean
}

// One message can cover several subjects, so it is saved as one note per part, each under its own initiative
// (api/routers/capture.py). `parts` has one entry per note created.
// What a capture saved as an item (a to-do, a list entry, a routine, a date).
export interface CreatedItem {
  id: number
  description: string
  due_date: string | null
  due_time?: string | null
  owner: TaskOwner
  repeat?: Repeat | null
  list_id?: number | null
  list_name?: string | null
  list_emoji?: string | null
}

export interface CapturePart {
  // null when the part was only items ("add Dune to my reading list") - nothing kept as a note
  interaction_id: number | null
  note_saved?: boolean
  initiative_id: number | null
  // Only ever set when initiative_id is null - a proposed name for a new initiative this part seems to be
  // about, for the frontend to offer as "add this as a new initiative?" (see ChatPage.tsx).
  // Set on this device after the user changes where the part went ("Filed under Health - its 2 tasks moved too").
  change_note?: string
  suggested_initiative: string | null
  // The existing initiative this part WAS filed under, by name - null means Others.
  initiative_name: string | null
  summary: string
  tasks_created: CreatedItem[]
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
  // Set once the user took back everything this capture saved (see CaptureReply's Undo).
  undone?: boolean
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
// "Create a reading list in Personal" / "make a space called Health": an instruction to the app, carried out. `capture`
// is set when the message went on to add something ("...and add Dune").
export interface ChatCommandResult {
  intent: 'command'
  status: 'answered'
  answer: string
  changed: ('lists' | 'initiatives')[]
  capture?: CaptureSavedResult
}
export type ChatResult = ChatCaptureResult | ChatAskResult | ChatBlockedResult | ChatCommandResult

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
