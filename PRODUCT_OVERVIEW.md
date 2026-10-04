# MyConfía — Product & Technical Overview

_Last updated: August 31, 2026_

This document exists to answer the questions a prospective customer, technical
reviewer, or new team member will actually ask: what is this product, how is
it built, what exactly happens to a user's data, which AI models power it,
and where does it currently fall short. It's written to be handed to someone
outside the engineering team without embarrassment, and precise enough that
an engineer can verify every claim against the code it describes.

---

## 1. Technical Architecture

### 1.1 Stack at a glance

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS v4, TanStack Query | Vercel |
| Backend API | Python, FastAPI, Uvicorn (ASGI) | Render (Docker) |
| Database | PostgreSQL with the pgvector extension | Supabase |
| Auth | Supabase Auth (email/password) | Supabase |
| Mobile | Android app | Google Play — a Trusted Web Activity (TWA), not a native app (see 1.4) |
| LLM inference | Groq (hosted) | Third-party API |
| Embeddings | Cohere (hosted) | Third-party API |
| OCR | Tesseract (local, open source) | Runs inside the backend container |
| Calendar sync | Google Calendar API (OAuth 2.0) | Third-party API |
| Location | Google Maps Geocoding API (optional) | Third-party API |
| Email | SMTP (e.g. Gmail with an App Password) | Third-party |

### 1.2 Why this stack

- **Supabase over a self-managed Postgres**: gets managed Postgres, auth, and
  a vector-search-capable database (pgvector) in one service, with a
  generous free tier for early-stage usage.
- **Hosted LLM/embedding APIs over local models**: local models (originally
  used for embeddings) exceeded Render's free-tier 512MB RAM limit and
  crashed the backend mid-request. Hosted APIs have no local memory
  footprint — the tradeoff is a network round-trip per call and dependence
  on the provider's uptime, which is why every AI call in this codebase is
  wrapped to degrade gracefully rather than hard-fail (detailed in §4).
- **A TWA instead of a native Android app**: the Android app is a thin shell
  that loads the live production web app. A backend or frontend deploy is
  live on Android immediately, with no separate app-store release required
  for most changes. A new build/release is only needed for changes to the
  native shell itself (app name, icon, manifest).

### 1.3 Data flow, end to end

```
User (web or Android)
   │
   ▼
Frontend (React/Vercel) ──HTTPS──▶ Backend API (FastAPI/Render)
                                        │
                    ┌───────────────────┼────────────────────┐
                    ▼                   ▼                    ▼
              Groq (LLM)          Cohere (embeddings)   Supabase (Postgres)
        (extraction, chat      (semantic search vectors)  (all app data,
         classification,                                   encrypted at
         search synthesis,                                 the field level
         daily brief)                                       — see §4.9)
```

Every request that touches the database goes through a single backend module
(`db.py`) that always talks to Supabase using the **service-role key**, which
bypasses Postgres Row-Level Security entirely. Multi-user data isolation is
therefore enforced **in application code**: every read/write is explicitly
filtered or scoped by the authenticated user's id. This is a deliberate
architecture choice (documented in `db.py`'s own header), not an oversight —
but it means correctness here depends on that filter being present on every
query, not on the database enforcing it independently.

### 1.4 Deployment

- **Backend**: Docker image built from the repo's `Dockerfile`, deployed on
  Render. Auto-deploys on every push to `main`.
- **Frontend**: Vercel, building the `frontend/` directory. Auto-deploys on
  every push to `main`.
- **Android**: a TWA (Trusted Web Activity) — an APK that is essentially a
  full-screen Chrome instance pointed permanently at the production Vercel
  URL. No app code is duplicated between web and Android.
- **Database migrations**: hand-applied SQL migrations (`schema.sql`), run
  manually in Supabase's SQL editor. There is no automated migration runner
  yet.

---

## 2. Features Provided to the User

### Capture
- **Unified chat** — a single input for everything: log a note, ask a
  question, or just jot a personal reminder. The app automatically decides
  which one you meant (see §3.2).
- **Type, speak, or scan** — capture by typing, recording voice (transcribed
  automatically), or photographing a business card.
- **Optional location tagging** — attach your current location to a note
  with one tap.

### Automatic understanding
- Every captured note is automatically parsed into: who it's about (if
  anyone), their role/company, sentiment on specific topics, decisions
  made, concerns raised, and any follow-up action items — with due dates
  and an owner (you or them).
- **Person-optional notes**: a note doesn't have to be about a specific
  person. A personal idea, to-do, or reflection is captured just as
  naturally as a meeting recap.
- **Initiatives**: your own life areas/projects (e.g. "Job," "Fitness,"
  "Personal") that every note is automatically sorted into — fully
  user-managed (create, rename, delete).

### People (your personal CRM)
- A profile per person: role, company, contact details, a running
  description, and a dated timeline of personal details (family, hobbies,
  life events) kept separate from professional notes.
- Every past interaction with that person, in order.
- Duplicate-contact merging.

### Notes
- Every note you've ever logged, browsable and filterable by initiative —
  including standalone notes that aren't about any person.

### Tasks & follow-ups
- Every action item extracted from your notes, automatically attributed to
  the right person when one is named in the task itself.
- Filterable by status (overdue, due soon, open, done) and by who owes it.
- One-click sync of any task to Google Calendar.

### Digest
- A daily view of what's due, what's on your calendar today, and which
  relationships have gone quiet (no interaction logged in 30+ days).
- An AI-written morning brief, delivered by email automatically each day
  (and available on-demand in the app).

### Ask
- A natural-language Q&A interface over everything you've logged —
  "What did Priya say about pricing?", "Who do I need to follow up with?",
  "Summarize my last call with Arjun."

### Privacy & account
- Notes, personal details, and task descriptions are encrypted at rest
  (see §3.9).
- Light/dark theme, adjustable text size.
- A one-time interactive tour of the app's sections.
- Standard email/password auth with Terms of Service acceptance, tracked
  per account (not per device).

---

## 3. How It Actually Works (technical detail)

This section is written for the questions a technical buyer or reviewer
will ask directly: *which models, how does X decide Y, what happens to my
data.*

### 3.1 Models in use today

| Purpose | Provider | Model | Notes |
|---|---|---|---|
| Note extraction, chat intent classification, query understanding, answer synthesis, daily brief writing | Groq | `openai/gpt-oss-120b` | One shared client/model for every text-generation task in the app. Groq's currently-available free-tier model — the model in use has already changed once (from a retired Llama model) and may change again if Groq deprecates it. |
| Voice transcription | Groq | `whisper-large-v3-turbo` | Same Groq account/API key as the model above. |
| Semantic search embeddings | Cohere | `embed-english-v3.0` | Produces 1024-dimensional vectors, stored in Postgres via the pgvector extension. |
| Business card OCR | Tesseract (local, open source) | — | Runs inside the backend container, no external API call, no cost per scan. |

**Why no vision-capable LLM for business cards**: Groq does not currently
expose a vision-capable model on the account this product uses (an image
sent to a text model, or to Groq's `compound` model, is rejected). Business
cards are therefore OCR'd locally with Tesseract, and the resulting raw text
is structured into fields (name, role, company, phone, email) with a
dedicated, small LLM prompt — same model as everything else, just handed
text instead of an image.

### 3.2 How the app decides "note" vs "question"

Every message sent through the unified chat is first classified by a
**dedicated LLM call** (not a keyword match) before anything else happens:

- The model is shown the message and asked to classify it as either
  `"capture"` (recounting a conversation, or logging any kind of note) or
  `"ask"` (a question about a person, past interaction, or open follow-up).
- Run at temperature `0` for maximum consistency, and constrained to return
  strict JSON (`{"intent": "capture" | "ask"}`).
- **Default on ambiguity or failure**: `"capture"`. The reasoning: a plain
  factual statement with no question mark is far more likely to be a note
  being logged than a question being asked, and if the classification call
  itself fails (network error, malformed response), the user's input still
  goes somewhere useful rather than being silently dropped.
- This adds one extra LLM call per chat message, on top of whichever
  downstream call (extraction or query-answering) handles the actual
  content.

### 3.3 How note capture and extraction works

1. **Intent routing** (above) determines this is a capture.
2. The backend fetches the user's current list of initiatives, so the model
   can classify the note into one of them by name.
3. **A single LLM call** sends the raw note text plus a detailed extraction
   prompt (today's date, the user's initiative names, and strict formatting
   rules) and gets back structured JSON: who the note is primarily about
   (or `null` — see below), any other people mentioned, the initiative it
   fits, a summary, sentiment per topic, decisions, concerns, follow-up
   tasks (with due dates and owner), and more. Run at temperature `0.2`,
   constrained to JSON output.
4. **The "is this even about a person" decision** is made by the same call:
   the prompt explicitly distinguishes an actual interaction (a
   conversation that happened) from a personal task/reminder that merely
   *references* someone without describing an exchange with them. Writing
   someone's name into a to-do does not, on its own, make the note "about"
   that person.
5. **Date resolution happens in code, not the model.** The model is
   instructed to output relative date phrases ("next Friday," "in 3 days")
   in a normalized form rather than computing the calendar date itself —
   weekday arithmetic is handled deterministically in Python, since LLMs
   are unreliable at date math. Absolute dates the note states outright are
   resolved by the model directly.
6. **Person matching**: if the note names a primary person, their name is
   scored against the user's existing contacts (fuzzy string similarity,
   not exact match). A confident single match auto-links to that person; a
   genuinely new name auto-creates a new contact; an ambiguous match (more
   than one plausible existing contact) surfaces a disambiguation prompt in
   the UI rather than guessing — the user always has final say before two
   people's histories get merged.
7. **Task attribution**: each extracted follow-up is matched against the
   note's own text to determine who it's *specifically* about (which may
   differ from the note's primary person, e.g. a secondary person named in
   one particular follow-up). This is deterministic text matching, not
   another LLM call — the extraction prompt already guarantees every task
   description names who it's for/from.
8. **Embedding**: a semantic-search vector is computed (Cohere,
   `embed-english-v3.0`) from the raw note text and stored alongside the
   note, powering the "Ask" feature's fuzzy/topical search.
9. **Storage**: the note, resolved person, initiative, and tasks are
   written to Postgres, with the free-text fields encrypted first (§3.9).

### 3.4 How "Ask a question" works

Two different retrieval strategies, chosen automatically based on the
question itself:

- **Named-person queries** ("What did Priya say about pricing?", "When did
  I last talk to Rohan?") — a query-understanding LLM call extracts the
  person's name and what's being asked for (latest interaction, a specific
  date, all of them, a count). That person is resolved the same
  fuzzy-match way as capture (disambiguating if needed), and their
  interactions are fetched **directly from Postgres by id** — an exact,
  deterministic lookup, not a search.
- **Vague/topical queries** ("that guy who was skeptical about pricing")
  with no resolvable name fall back to **semantic search**: the query is
  embedded (Cohere) and compared against every stored note's vector using
  pgvector's cosine-similarity index inside Postgres — a real
  nearest-neighbor search, not a Python-side scan.
- Either way, whichever notes get retrieved are handed to a final LLM call
  that writes the natural-language answer, **explicitly instructed to
  answer only from the retrieved text, never to invent details.**
- Pronoun/back-reference resolution ("him too," "that meeting") is handled
  by feeding the recent chat history into the query-understanding step, so
  a short follow-up question doesn't need to re-state who it's about.

### 3.5 "Grounded generation" — how hallucination risk is managed

A pattern used consistently across the product, worth calling out
explicitly since it's the main technical answer to "how do you prevent the
AI from making things up": **every fact the AI states in a summary — counts,
names, dates — is computed first in plain Python, and the AI is only ever
asked to phrase already-correct information, never to count, recall, or
calculate.** The daily brief is the clearest example: task counts,
overdue calculations, and calendar events are all assembled in code before
a single LLM call turns that into readable prose. The Q&A feature follows
the same shape — retrieval happens first and is handed to the model as
fact, with an instruction not to answer beyond it.

### 3.6 Business card scanning

1. The photographed card is OCR'd locally with Tesseract — no image ever
   leaves the server as an image.
2. The raw OCR text (which can be noisy — line breaks, logo artifacts) is
   sent to the same Groq text model with a dedicated prompt that extracts
   name, role, company, phone, and email into structured fields.
3. The result is shown to the user as an **editable form** before saving —
   OCR output is treated as a draft, not trusted automatically, unlike
   voice transcription which is fed directly into the normal capture
   pipeline.
4. Business cards are not classified into an initiative (there's no free
   text to classify) — they always land "Uncategorized," a known, accepted
   limitation rather than a bug.

### 3.7 Voice capture

Recorded audio is sent to Groq's hosted Whisper model
(`whisper-large-v3-turbo`) and the returned transcript is fed through the
**exact same** extraction pipeline as typed text — voice is a different
input method, not a different capture path.

### 3.8 Daily brief email

A scheduled job (triggered by GitHub Actions on a cron schedule) calls a
backend endpoint that, for every user who has the feature enabled: gathers
today's due/overdue tasks, today's calendar events, and relationships that
have gone quiet — all computed directly from the database — then makes one
LLM call to turn that into a short, warm, skimmable brief, and emails it via
SMTP. See §4 for a real limitation currently affecting this feature on the
free-tier backend host.

### 3.9 Data encryption

- **What's encrypted**: note text, summaries, sentiment/topic/decision/
  concern data, a contact's free-text description and personal-notes
  timeline, task descriptions, and stored Google OAuth tokens — encrypted
  with a server-held symmetric key (Fernet/AES) before being written to
  Postgres, and decrypted transparently on read.
- **What's deliberately not encrypted**: a contact's name, company, role,
  phone, email, and tags, and initiative names. These fields are used for
  matching and search (candidate resolution during capture, company
  grouping, alias lookup) — encrypting them would break that matching, and
  they carry materially less sensitive content than the actual notes.
- **Threat model**: this protects against someone with direct database
  access (a leaked database credential, a raw backup, an operator browsing
  the table) — they see ciphertext, not note content. It does **not**
  provide end-to-end/zero-knowledge encryption: the application itself
  still decrypts notes to run extraction, search, and the daily brief,
  since those AI features are the product. Note text is also sent to the
  AI providers (Groq, Cohere) in plaintext, in transit, for that
  processing — inherent to any product doing AI processing on your notes,
  not specific to this implementation.
- **Key management**: the encryption key lives outside the database
  entirely (in the hosting platform's environment variables), specifically
  so that database access alone is never sufficient to read note content.
  **If this key is ever lost, all encrypted data becomes permanently
  unreadable — there is no recovery mechanism.**

### 3.10 Initiative classification

A note's initiative is chosen by the same extraction LLM call as
everything else, constrained to pick **only** from the user's current list
of initiative names (passed into the prompt) or `null`. The model is
explicitly instructed to prefer `null` ("Uncategorized") over guessing when
it isn't confident, and the backend independently re-validates the
returned name against the user's actual initiative list before storing it
— the model can never cause a new initiative to be silently created.

---

## 4. Limitations & Known Constraints

Several of these stem directly from running on free tiers of third-party
services — worth being upfront about, since they affect reliability in ways
a paid tier would resolve.

### Free-tier infrastructure
- **Backend (Render free tier)**: the server **sleeps after ~15 minutes of
  inactivity**, so the first request after a gap is slow (30–60 second cold
  start). The free tier's 512MB RAM ceiling is also why embeddings run via
  a hosted API rather than a local model — a local model was OOM-crashing
  the backend on every embedding call before that change.
- **Outbound email is currently unreliable on this host.** Render's free
  tier blocks common outbound SMTP ports, which can silently prevent the
  daily brief email from sending even when the app reports success. This
  needs either a paid Render tier or a switch to an HTTP-based email API
  (e.g. Resend) to be reliably fixed — **flagged as an open item, not yet
  resolved.**
- **Database (Supabase free tier)**: subject to Supabase's current
  published free-tier storage, row, and bandwidth limits, and the project
  can pause after extended inactivity. Check Supabase's current terms for
  exact numbers, as these change over time.

### AI/model constraints
- **No vision-capable model available** on the current Groq account —
  business cards are OCR'd locally rather than read directly by an LLM,
  which is more sensitive to poor photo quality/lighting/unusual card
  layouts than a vision model would be.
- **Extraction is not perfectly deterministic.** The same note, submitted
  multiple times, can occasionally classify slightly differently (e.g.
  whether a mentioned person becomes the note's primary subject or a
  secondary mention). The product has deterministic fallback logic and
  manual correction paths for when this happens, but it is a real,
  observed characteristic of LLM-based extraction, not a bug that gets
  fully "fixed."
- **Free-tier rate limits** apply to both Groq and Cohere. Heavy usage
  (many users, high capture volume) can hit rate limits on either provider;
  the app is built to degrade rather than crash — a failed embedding call
  simply means that one note isn't searchable semantically until re-tried,
  rather than blocking the capture itself — but throughput is bounded by
  those limits until upgraded to paid tiers.
- **Model availability isn't permanent.** The text model in use has
  already changed once because Groq retired the previous one. Free-tier
  model offerings can change or be deprecated with limited notice.

### Product-level limitations
- **No end-to-end encryption** — see §3.9. Marketed accurately as
  encryption "at rest against direct database access," not as a
  zero-knowledge product.
- **Google Calendar and Maps integrations require Google Cloud API
  credentials to be configured** — without them, calendar sync and
  address lookup are simply unavailable (location capture itself still
  works via a plain map link, no key required).
- **No automated test suite yet.** Testing today is manual/checklist-driven
  (see the project's QA playbook); several real bugs in task attribution
  and theming have been found this way rather than by automated coverage.
- **Multi-tenant isolation is enforced in application code, not by the
  database** (§1.3) — correct by design and consistently audited, but
  worth stating plainly rather than implying database-level guarantees
  that don't exist in this architecture.
