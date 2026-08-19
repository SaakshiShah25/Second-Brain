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
}

export interface StalePerson extends Person {
  last_interaction_date: string
  days_ago: number
}

export interface CompanyGroup {
  company: string
  people: { id: number; name: string; role: string }[]
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

export interface SentimentEntry {
  topic: string
  sentiment: string
}

export interface Interaction {
  id: number
  person_id: number
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
  // discovery/demo/negotiation/check-in/networking/contract/support/internal/other
  meeting_type: string
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
    person: { id: number; name: string }
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
  primary_person: ExtractedPrimaryPerson
  other_people?: { name: string; relation: string }[]
  date_mentioned: string | null
  location: string | null
  appearance_this_meeting?: string
  meeting_type?: string
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
  person_id: number
  resolved_name: string
  created_new: boolean
  interaction_id: number
  summary: string
  tasks_created: { description: string; due_date: string | null; owner: TaskOwner }[]
  date_warning: string | null
  skipped_due_dates: { description: string; raw_due_date: string }[]
  geo_address: string | null
  maps_url: string | null
  meeting_type: string
  decisions: string[]
  concerns: string[]
}

export interface CaptureConfirmRequiredResult {
  status: 'confirm_required'
  extracted: ExtractedNote
  raw_text: string
  interaction_date: string
  date_warning: string | null
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

export interface AskAnsweredResult {
  status: 'answered'
  answer: string
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
}

export type ChatMode = 'capture' | 'ask' | 'card'

// ---------- Clients (Phase 10) ----------

export type ExpiryState = 'active' | 'expiring_soon' | 'expired' | 'terminated'

export interface Signatory {
  name: string
  role: string
  side: 'client' | 'provider'
}

export interface ClientSignatory extends Signatory {
  id: number
  person_id: number | null
  person: { id: number; name: string } | null
}

export interface Client {
  id: number
  company: string
  client_legal_name: string
  provider_legal_name: string
  effective_date: string | null
  term_months: number | null
  end_date: string | null
  auto_renews: boolean
  renewal_notice_days: number | null
  fee_amount: number | null
  fee_currency: string
  fee_frequency: string
  payment_terms: string
  termination_terms: string
  other_terms: string
  status: string
  document_path: string | null
  document_filename: string
  created_at: string
  expiry_state: ExpiryState
}

export interface ClientDetail extends Client {
  signatories: ClientSignatory[]
}

// What POST /api/clients/upload returns - fields extracted from the
// document for review, plus the original file round-tripped as base64
// so /api/clients/confirm can save it without a second upload.
export interface AgreementExtracted {
  client_company: string
  client_legal_name: string
  provider_legal_name: string
  effective_date: string | null
  term_months: number | null
  end_date: string | null
  auto_renews: boolean
  renewal_notice_days: number | null
  fee_amount: number | null
  fee_currency: string
  fee_frequency: string
  payment_terms: string
  termination_terms: string
  other_terms: string
  signatories: Signatory[]
}

export interface AgreementUploadResult {
  extracted: AgreementExtracted
  file_base64: string
  filename: string
  content_type: string
}
