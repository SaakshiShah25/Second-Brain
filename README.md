# Second Brain — Prototype (Capture + Extraction + Storage)

Passive... no — **interactive-confirmation** person resolution (see below).
Storage now runs on Supabase (Postgres + pgvector) instead of local SQLite.
Retrieval comes in a later step.

## Migrating to a PWA (in progress)

The app is being rebuilt as an installable PWA: **FastAPI backend**
(`api/`) + **React/Vite/Tailwind frontend** (`frontend/`), replacing
Streamlit - which can't be a real installable/offline PWA (it's a
server-driven rerun-per-interaction model, no client-side app shell) and
caps how polished a custom UI can get. See the roadmap in the plan file
for the full picture.

> **The Streamlit app (`app.py`/`views/`) is no longer maintained.** As of
> the auth migration (below), `db.py`'s functions require an explicit
> `user_id` on every call - the Streamlit app doesn't have a login flow to
> supply one, so it will error out. It's left in the repo for reference
> but isn't being kept working; the FastAPI+React app is the real app now.

**To run the new stack** (two servers):
```bash
# terminal 1 - backend
uvicorn api.main:app --reload --port 8000
# Swagger UI at http://localhost:8000/docs

# terminal 2 - frontend
cd frontend
npm install        # first time only
npm run dev         # Vite on http://localhost:5173
```
The backend needs the same environment variables as before
(`GROQ_API_KEY`/`SUPABASE_URL`/`SUPABASE_KEY` - see Setup below), read
from the repo-root `.env` via `python-dotenv`. The frontend needs its own
`frontend/.env.development` - see **Auth setup** below for what goes in it.

Current status: Digest (with per-task Google Calendar sync), Chat
(text/voice/business-card capture with opt-in location, ask, with the
same person-disambiguation flow as Streamlit), People (list + detail +
edit + merge + briefing), auth (multi-user login/signup), and deployment
(Vercel + Render) all work end-to-end against the real API.

### Auth setup (Supabase Auth, multi-user)

Every person/interaction/task row now belongs to a `user_id`, and the
frontend requires signing in before it'll load. One-time setup:

1. **Enable Email auth** - in the Supabase dashboard, under
   Authentication -> Providers, the Email provider should already be on
   by default. By default it also requires confirming a signup via an
   emailed link before that account can sign in - fine for real use, but
   worth knowing about if a fresh signup doesn't let you log in right away
   (check your inbox, or turn off "Confirm email" in Authentication ->
   Providers -> Email while testing).
2. **Get the anon/public API key** - Project Settings -> API ->
   Project API keys -> `anon` `public` (NOT the `service_role` key -
   that one stays server-side only, in the repo-root `.env`).
3. **Set the frontend's env vars** - in `frontend/.env.development`:
   ```
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<the anon/public key from step 2>
   ```
4. **Run the schema migration** - `schema.sql` sections 9-12 add the
   `user_id` columns, indexes, and RLS policies, and document a one-time
   backfill for any data that predates auth. Run it in the Supabase SQL
   Editor (see the comments in `schema.sql` for the exact order - the
   backfill/NOT NULL steps are deliberately commented out until you've
   signed up at least once and know your `auth.users.id`).

Once that's done, visiting the app redirects to `/login` if you're signed
out; sign up (or sign in) there, and every page loads only your own data.

### Google Calendar + location setup

Two optional features, both off until you set them up: a manual "Add to
Calendar" button per task (Digest page), and an opt-in "📍" location
button on the capture screen (Chat page, Log a note mode). Neither is
required for the rest of the app to work.

**Google Calendar** (needs a Google Cloud OAuth client):
1. In the [Google Cloud Console](https://console.cloud.google.com), create
   or reuse a project, then enable the **Google Calendar API**
   (APIs & Services -> Library).
2. Configure the OAuth consent screen (APIs & Services -> OAuth consent
   screen): External, Testing mode is fine for personal use - add your
   own Google account under "Test users" (an unverified app in Testing
   mode only lets added test users complete the OAuth flow).
3. Create credentials -> OAuth client ID -> Application type "Web
   application", with an authorized redirect URI of
   `http://localhost:8000/api/calendar/oauth/callback`.
4. Set these in the repo-root `.env` (see the placeholders already there):
   ```
   GOOGLE_CLIENT_ID=<from step 3>
   GOOGLE_CLIENT_SECRET=<from step 3>
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/api/calendar/oauth/callback
   ```
5. Run the Phase 6 section of `schema.sql` (adds `task.calendar_event_id`,
   the `google_credentials`/`oauth_state` tables, and their RLS policies)
   in the Supabase SQL Editor.
6. In the app, go to Digest -> "📅 Connect Google Calendar" and approve
   the consent screen. Tasks with a due date then get an "Add to
   Calendar" button.

**Location capture** (works with zero setup - the map link needs no API
key at all):
- Tapping "📍" on the capture screen uses the browser's Geolocation API
  (one permission prompt) and attaches a map link
  (`google.com/maps?q=lat,lng`) to that note - no Google Cloud project
  needed for this part.
- *Optional*: for a human-readable address instead of raw coordinates,
  enable the **Geocoding API** in the same Google Cloud project, create
  an API key (Credentials -> Create credentials -> API key), and set
  `GOOGLE_MAPS_API_KEY` in `.env`. Without it, location capture still
  works - it just shows coordinates instead of an address.

### Deployment (Vercel + Render)

**Backend needs Docker** (not the plain Python buildpack) - `card_scan.py`
needs the Tesseract OCR *binary* (`apt-get install tesseract-ocr`, not
just the `pytesseract` pip package) and `embeddings.py`'s
sentence-transformers/torch are memory-hungry, both of which the
`Dockerfile` at the repo root already handles.

1. **Get the code on GitHub** - create an empty repo at github.com/new
   (no README/license, so the push isn't a merge conflict), then:
   ```bash
   git remote add origin <your-repo-url>
   git branch -M main
   git push -u origin main
   ```
2. **Render (backend)** - New Web Service -> connect the repo -> Render
   auto-detects the `Dockerfile` (environment = Docker). `render.yaml`
   documents the service config and the full env var checklist (values
   are secrets - set them in the Render dashboard, not in the file):
   `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `FRONTEND_URL` (set
   this after step 3), and - only if you want Calendar/location working
   in production - `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
   `GOOGLE_OAUTH_REDIRECT_URI`/`GOOGLE_MAPS_API_KEY`. The free tier's
   memory limit is a real OOM risk with torch loaded - at least the
   smallest paid tier is recommended.
3. **Vercel (frontend)** - Import the same repo, set **Root Directory to
   `frontend`** (framework preset auto-detects as Vite), and set
   `VITE_API_URL` (the Render URL from step 2), `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY` (same values as `frontend/.env.development`).
   `frontend/vercel.json` handles the SPA routing fallback so client-side
   routes like `/people/5` don't 404 on refresh.
4. **Close the loop** - back in Render, set `FRONTEND_URL` to the Vercel
   URL from step 3 and redeploy (env var changes need a redeploy to take
   effect) - this is what `api/main.py`'s CORS config and the Calendar
   OAuth redirect both key off.
5. **Supabase dashboard** - Authentication -> URL Configuration -> add
   the Vercel URL to Site URL / Redirect URLs (only localhost is allowed
   by default; without this, signup confirmation emails link back to
   localhost instead of your live site).
6. *(Only if enabling Calendar in production)* **Google Cloud Console** -
   add `https://<your-render-url>/api/calendar/oauth/callback` as an
   additional Authorized redirect URI on the existing OAuth client
   (Google allows more than one; localhost can stay for local dev).

## UI (Streamlit - being replaced, see above)

```bash
streamlit run app.py
```

Opens a multi-page app in your browser (`app.py` is a thin
`st.navigation` router; each page lives in `views/`):

- **🌅 Digest** (`views/digest_view.py`) — the default landing page, and
  the only place tasks are managed (this used to be a separate Tasks
  page - folded in since it was showing overlapping data with a
  different framing). Every follow-up task in one place with an
  Overdue/Due soon/Open/Done/All filter, mark-done everywhere, plus
  relationships that have gone quiet (no interaction in N days,
  adjustable). The point is seeing what needs attention without having
  to think to ask. "Get briefing" for a specific person lives on the
  People page, not here - this page is for scanning across everyone.
- **💬 Chat** (`views/chat_view.py`) — log a note, ask a question, or scan
  a business card (sidebar mode toggle). Typing, voice, and business-card
  photo all funnel into the same `capture.py`/`retrieval.py` logic underneath
  - see "Voice input" and "Business card capture" below.
- **🧑‍🤝‍🧑 People** (`views/people_view.py`) — browse a person's full
  interaction timeline, fix a mistake (wrong extraction, typo) in either
  their profile or a specific logged interaction, merge two Person rows
  that turned out to be the same human, and pull up a "Get briefing" for
  them directly (see "Pre-meeting briefings" below).

Everything below this section (the `python capture.py` / `python
retrieval.py` CLI scripts) still works too and is useful for quick
debugging, but the UI is the intended way to use this day-to-day.

### Pre-meeting briefings

`retrieval.generate_briefing(person_id)` turns everything recorded about
a person (their profile, every interaction — including ones where they
were only a secondary mention, see below — and open follow-ups) into a
short, natural summary meant to jog your memory before reconnecting: who
they are, what was last discussed and how it went, anything worth
remembering about them personally, and what's still open. It's manually
triggered (no calendar integration) from the top of a person's profile on
the People page — deliberately not on the Digest page, which is for
scanning across everyone rather than going deep on one person. Same
grounding rules as everything else: only from stored records, and it
says so plainly if you've never actually talked to this person directly
(only heard about them via someone else).

### Business card capture

The "📇 Scan a card" mode uses your browser's camera (`st.camera_input`)
to photograph a business card, then:
1. **OCRs it locally** with Tesseract (`card_scan.py`, via `pytesseract`)
   — Groq doesn't currently expose a vision-capable model on this
   project's account (checked live against the account's actual model
   list before building this), so this reads the image without sending
   it to any LLM.
2. **Structures the OCR'd text** (name/role/company/phone/email) with a
   small dedicated prompt through the same shared Groq text client
   (`llm_client.py`) used everywhere else — this step also cleans up
   typical OCR noise (e.g. reassembling a mangled email address).
3. Shows the result in an **editable confirmation form** before saving —
   unlike voice (trusted as-is), a misread structured field like an email
   address is worse silently wrong than a misheard word in a note, so
   this gets a review step voice didn't need.
4. On save, goes through the exact same person-resolution path as a
   typed note (`_process_extracted()` in `chat_view.py`) — if the scanned
   name matches an existing person, you get the same confirm-buttons
   disambiguation, not a silent guess.

Requires the Tesseract OCR binary on the machine running this (the
`pytesseract` pip package is only a wrapper around it):
```bash
brew install tesseract          # macOS
apt install tesseract-ocr        # Linux
```
OCR accuracy depends on photo clarity/lighting/angle, same caveat as any
OCR tool — a blurry or heavily-angled photo will read worse.

### Voice input

The mic recorder on the Chat page (`st.audio_input`) records a clip in
your browser; on submit it's sent to Groq's hosted Whisper model
(`voice.py`, using the same `GROQ_API_KEY` as everything else — no
separate setup) and the transcript is fed straight into
`handle_capture()`/`handle_retrieval()`, same as typed text. If
transcription fails or comes back empty, a warning shows in the chat
instead of silently doing nothing.

Design notes:
- **Why chat, and why an explicit mode toggle instead of guessing intent:**
  both logging a note and asking a question are naturally just typing a
  sentence, so one chat surface fits better than separate forms. But
  whether a given message is a note-to-save or a question-to-answer is a
  one-click toggle rather than an LLM guessing — simpler, cheaper, and
  removes a whole class of misclassification bugs. Easy to swap for
  auto-detection later if you want a single unified input.
- **Person disambiguation happens inline as buttons**, not a blocking
  terminal prompt — when a note or query is ambiguous about who's being
  referred to, the assistant's chat bubble shows the candidates as
  clickable buttons and waits for your choice before continuing.
- Sidebar shows live Supabase/Groq connection status and a list of people
  logged so far.
- **Destructive actions on the People page** (delete a person, delete an
  interaction, merge two people) go through an `st.dialog` confirmation
  first — merging and deleting are irreversible, so a stray click
  shouldn't be enough to trigger them.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### 1. Groq (free LLM for extraction)

Get a free key: https://console.groq.com/keys

```bash
export GROQ_API_KEY="your_key_here"
```

### 2. Supabase (free Postgres + pgvector, replaces the old SQLite file)

1. Create a free project at https://supabase.com
2. Open **Project -> SQL Editor -> New query**, paste in the contents of
   `schema.sql` from this folder, and run it. This creates:
   - the `person`, `interaction`, `task`, `interaction_person` tables
   - the `pgvector` extension
   - a `vector(384)` column on `interaction.embedding` (a real vector type,
     not a JSON list stuffed into a text column)
   - an `ivfflat` cosine-similarity index on that column
   - a `match_interactions()` SQL function that performs the actual vector
     search (used by `db.search_interactions_by_embedding()`)

   **Already have a project set up from before `interaction_person`
   existed?** Re-run `schema.sql` - every statement in it is
   `create table if not exists` / `create index if not exists`, so
   re-running it is safe and will just add the new table without touching
   your existing data. There's no `supabase-py` REST call that can create
   a table, so this SQL Editor step is the only way to apply it - `db.py`
   can't do it for you.

   **Already have a project set up from before `person.phone`/`email`
   existed** (added for business card capture)? `schema.sql` now also
   ends with `alter table person add column if not exists phone/email
   ...` - re-running the whole file picks these up too, safely (`if not
   exists` on both the table-level create and these alters).
3. Get your project URL and **service_role** key from **Project Settings ->
   API**, and set them as environment variables:

```bash
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_KEY="your_service_role_key"
```

> **Why service_role and not anon?** This is a single-user local script, not
> a public frontend. The service_role key bypasses Row Level Security so
> the script can freely read/write without setting up RLS policies. Never
> ship the service_role key inside a client-facing app (web/mobile) — if you
> later build a UI that talks to Supabase directly, switch to the anon key
> and add RLS policies first.

### Sanity check the connection

```bash
python db.py
```

Should print `Connected to Supabase successfully.` If you get a
`SUPABASE_URL / SUPABASE_KEY environment variables not set` error, check
your env vars; if you get a table-not-found error, re-check that
`schema.sql` ran successfully.

## Capture a note

```bash
python capture.py
```

Paste/type a free-form note about a conversation, then press Enter on an
empty line to submit. Example input:

```
Met Rohan from Acme Logistics today for a demo. He's a Procurement Manager
there. He seemed skeptical about our pricing vs their current vendor, but
impressed with the product demo itself. Wears glasses, very analytical,
comes across as sincere. Was wearing a blue shirt and blazer. Said he'd
check with his team and get back next week. Need to send him a pricing
comparison doc by Friday.
```

What happens under the hood:
1. `extraction.py` sends the note to Groq (free Llama model, with today's
   actual date injected so it can resolve "today"/"by Friday"/etc. into
   absolute dates) and gets back structured JSON.
2. `capture.py` checks the mentioned person's name against existing
   `Person` rows in Supabase. If there's any plausible match (including an
   exact alias/nickname match — nicknames aren't unique), it **asks you to
   confirm** before merging rather than guessing. Only when there's zero
   plausible candidate does it create a new person automatically.
3. A local embedding of the raw note is computed with `sentence-transformers`
   (free, runs on your machine, no API call).
4. Everything is written to Supabase: the Person row is created/updated,
   an Interaction row is stored (raw text + structured fields + the
   embedding in a real `vector` column), and any follow-ups become Task
   rows with resolved due dates.

## Quick sanity check on extraction alone

```bash
python extraction.py
```

Runs a hardcoded sample note through the extractor and prints the JSON —
useful for testing your Groq key and iterating on the extraction prompt
without touching the database.

## Person resolution is interactive, not automatic

Nicknames aren't unique — "Sid" could be short for a "Sidharth" you met
months ago, or a completely different new person also called Sid. So
whenever an extracted name has *any* plausible match against existing
people, `capture.py` stops and asks you to confirm:

```
The note mentions 'Sid' (friendly, works in marketing).
Is this the same person as one of these existing entries?
  1. Sidharth (aka Sid) — tall, works in finance — Analyst, XYZ Corp [match: 100%]
  0. None of these — 'Sid' is a new person
Enter number:
```

Only when there are **zero** plausible candidates does it create a new
person automatically — there's nothing to confirm in that case.

## Data model notes

- **`Person.description`**: general, stable traits only — physical build,
  personality/demeanor. New observations are *appended* here over time,
  never overwritten, so it builds into a running picture of the person.
- **`Person.role` / `Person.company`**: job title and organization. These
  are *overwritten* (not appended) on each update, since these are current
  facts that change (promotions, job switches), not accumulating traits.
- **`Interaction.appearance`**: what they wore/looked like at that
  *specific* meeting — per-interaction, not per-person.
- **`Interaction.embedding`**: a real `vector(384)` pgvector column, with
  an `ivfflat` cosine-similarity index — genuine approximate-nearest-
  neighbor vector search inside Postgres, not a Python-side loop over
  JSON blobs.
- **Sentiments are per-topic**: a note can say someone was skeptical about
  pricing but impressed by the demo, and both are captured as separate
  `{topic, sentiment}` entries in `Interaction.sentiment` (jsonb).

## Notes / things you'll likely want to tune

- **CANDIDATE_THRESHOLD** in `capture.py` (default `0.5`) — how similar a
  name needs to be before it's even shown as a candidate to confirm.
- **MODEL_NAME** in `extraction.py` — set to a current free Groq model.
  Check https://console.groq.com/docs/models for the latest list if the
  hardcoded one gets deprecated.
- The `sentence-transformers` model (`all-MiniLM-L6-v2`) downloads once
  (~80MB) on first run and is cached locally after that. It produces
  384-dimensional vectors — matching `schema.sql`'s `vector(384)` column.
  If you swap embedding models later, update that dimension too (and
  re-embed existing rows).
- If you skip installing `sentence-transformers`, capture still works —
  it just stores `embedding = NULL`, and you'll only get structured
  person-based retrieval (no semantic "that skeptical guy" search) until
  you add it back.
- **Supabase free tier limits** (as of writing): 500MB database, 2 free
  projects, project pauses after a week of inactivity (just reopen it in
  the dashboard to wake it up). Fine for a prototype; check
  https://supabase.com/pricing if you outgrow it.

## Ask a question (retrieval)

```bash
python retrieval.py
```

Type a question, press Enter. Two things can happen depending on what you ask:

**A. You name a specific person** — e.g. "What did I talk to Rohan about
last time?", "When did I first meet Priya?", "Summarize everything with
Sid". `retrieval.py` resolves the name against existing `Person` rows
(same fuzzy matching as capture, but **read-only** — it never creates a
new person here). If the name could plausibly mean more than one existing
person, you're asked to pick:

```
'Sid' could refer to more than one person you've logged:
  1. Sidharth — tall, works in finance — Analyst, XYZ Corp [match: 100%]
  2. Sid — friendly, works in marketing — Marketing Lead, Beta Inc [match: 100%]
  0. None of these
Enter number:
```

Once resolved, it pulls that person's interactions directly by
`person_id` and narrows to what the question implies: `latest` meeting,
`first` meeting, one near a `specific_date`, or `all` of them (for
relationship-level summaries).

**B. You give a vague reference, no name** — e.g. "Who was that guy
skeptical about pricing?", "What did we discuss about the Q3 roadmap?".
No person is resolvable, so it falls back to semantic search: your query
is embedded and matched against stored interaction embeddings via
`db.search_interactions_by_embedding()` — a real pgvector cosine-
similarity search running inside Postgres.

Either way, whatever gets retrieved is handed to Groq with an instruction
to answer **only** from those records (not to invent anything), and to
say so plainly if the records don't actually contain an answer.

### How query understanding works

Before either path runs, `retrieval.py` sends your raw question to the
LLM (`parse_query()` in `retrieval.py`) to extract: any person name
mentioned, the intended scope (`latest`/`first`/`specific_date`/`all`),
a resolved absolute date if one was implied, and a clean semantic
restatement of the question (used for the vague-query fallback). Like
extraction, this is anchored to today's actual date so "last time",
"first met", "in May" etc. resolve correctly.

## Handling pronouns and back-references ("he", "that day")

Since this is a chat interface, later turns naturally use pronouns and
vague references instead of repeating a name: "What was discussed with
Rohan in the last meeting?" followed by "What did **he** wear **that
day**?" This is handled without any separate state-tracking machinery:

- Each turn, the last few exchanges (`retrieval.format_recent_context()`)
  are passed alongside the current question into `parse_query()`.
- The query parser is instructed to resolve pronouns/back-references
  against that recent text **only when it's reasonably unambiguous** -
  it works because the assistant's own prior answers already state the
  relevant person's name and any relevant dates explicitly (the synthesis
  prompt is instructed to reference dates), so "he" and "that day" have
  something concrete to resolve against.
- If a question already names a person or date explicitly, that always
  takes priority over anything inferred from context.
- If the reference is genuinely ambiguous (e.g. two different people were
  just discussed and "him" could mean either), the parser is told to
  leave it unresolved rather than guess - it'll fall through to the
  normal "no person found" / semantic-search behavior rather than
  silently picking the wrong person.

This context window is a few recent turns, not the entire conversation
history - long-range references ("that person I asked about 20 messages
ago") aren't resolved this way. If that turns out to matter in practice,
the more robust fix is explicit state (tracking the last-resolved person/
interaction in session and reusing it directly) rather than a longer text
window - worth revisiting if you notice it failing on real usage.

## Handling malformed dates from the LLM

Occasionally the extraction/query-parsing LLM returns a partial date
instead of a complete one — e.g. `"2026-09"` for a note that only says
"sometime in September," with no specific day. Postgres's `date` columns
reject that outright (`invalid input syntax for type date`), and without
handling it that would crash the whole save.

Two layers guard against this:
1. The extraction and query-parsing prompts (`extraction.py`,
   `retrieval.py`) are explicitly instructed to always resolve to a
   complete `YYYY-MM-DD` date or `null` — never a partial one.
2. **Defensively, regardless of what the LLM actually returns**,
   `date_utils.to_valid_date()` validates every date string before it
   reaches `db.py`. An invalid value becomes `None` instead of failing
   the insert — the interaction/task still gets saved, just without that
   particular date, and a warning is surfaced (printed in the CLI,
   shown inline in the chat in the Streamlit UI).

## Schema note: `other_people` format changed

`extracted_facts.other_people` used to be a flat list of names (e.g.
`["Rhea"]`). It's now a list of `{"name": ..., "relation": ...}` objects,
capturing how that person relates to the primary person/you (e.g.
`{"name": "Rhea", "relation": "Priya's sister"}`) — a bare name told you
someone else was mentioned but not how they connected to anything.

**Rows captured before this change still have the old flat-string
format.** `retrieval.py`'s formatting handles both shapes so old data
won't break, but it also won't retroactively gain relationship context —
only newly captured notes will. If you want existing rows upgraded, that
would mean re-running extraction on their stored `raw_text` and updating
`extracted_facts`; not done automatically here.

Similarly, follow-up task descriptions are now prompted to be
self-contained and specific (e.g. "Send Vikas a revised delivery
timeline for the project" instead of "send revised timeline") - existing
vague tasks already in your `task` table won't be rewritten, only newly
extracted ones will be phrased this way.

## `other_people` mentions are now linked to real Person records

A note that mentions someone besides its primary person (e.g. "...his
colleague Neha joined too, she's new to sales") used to just store that
as text inside `extracted_facts.other_people` - Neha had no Person row,
so asking "what do I know about Neha?" later found nothing, even though
she'd been named.

Now, `capture.py`'s `resolve_and_link_other_people()` runs right after
each interaction is stored: for every `other_people` entry, it either
links to an existing Person (on a confident, near-exact name/alias match
via `person_match.find_confident_match()`) or creates a new lightweight
one, then records the link - who, in which interaction, and how they
relate to that interaction's primary person - in the new
`interaction_person` table.

**This never interactively asks**, unlike resolving the note's primary
person. These are secondary, in-passing mentions rather than the note's
actual subject, so a wrong guess is lower-stakes - and now that the
People page has a merge feature, a wrongly-created duplicate is a
one-click fix rather than a real problem. If it turns out this creates
more noisy duplicates than expected in practice, tightening the
confidence threshold (`person_match.find_confident_match`'s default
`0.9`) or switching to an interactive confirmation (like the primary
person) would be the fix - not something built now.

Where this shows up:
- **Retrieval**: asking about someone links in interactions where they
  were only a secondary mention too (`retrieval.get_all_interactions_for_person()`),
  clearly phrased as "mentioned in a note about X", not a direct
  conversation with them.
- **People page**: a "Mentioned in" section lists every interaction they
  were linked to as a secondary person, read-only for now (fixing that
  interaction's content still happens from the primary person's page).

**Only applies going forward** - same caveat as the `other_people` format
change above: existing interactions' `other_people` mentions aren't
retroactively linked, only newly captured notes get this.

## first_met_date reflects the note, not the day you logged it

`Person.first_met_date` is now set from the interaction's actual
(extracted, validated) date — the same date resolution used for the
`Interaction.date` column — rather than always being `date.today()`. So
logging a note today that says "met him last week" correctly backdates
`first_met_date`, instead of recording today as when you first met them.

On a **merge** into an existing person, `first_met_date` is never
touched — there's no update path for it at all, by design, since that
person's actual first meeting necessarily happened in an earlier,
already-stored interaction.

**Rows created before this fix will have `first_met_date` set to
whatever day you happened to run the capture**, which may not match the
note's actual content for any note describing a past meeting. Not
retroactively corrected here — same caveat as the `other_people`/task
description changes above.

## What's built vs. still open

Built: capture (typed, voice, or business card photo) with interactive
person resolution, per-topic sentiment, follow-up tasks with resolved due
dates, semantic + structured retrieval with pronoun/back-reference
resolution, a Digest page (all tasks with an Overdue/Due soon/Open/Done/
All filter + stale relationships), manually-triggered pre-meeting
briefings, a People page for browsing/editing/merging, and secondary
("other_people") mentions linked to real, independently-queryable Person
records.

Still open, worth revisiting if it turns out to matter in practice:
- **Group interactions**: each Interaction row has a single `person_id` -
  a note describing a meeting with two people at once still has to be
  filed under one primary person; the other participant is now a linked
  secondary mention (`interaction_person`, see above), not a first-class
  interaction record shared equally by both.
- **Secondary mentions are read-only**: the People page's "Mentioned in"
  section shows them, but there's no way to unlink a wrong one or edit
  that interaction from there - you'd go to the primary person's page.
- **Digest is in-app only, not a real push**: it surfaces the moment you
  open the app, but nothing reaches you if you don't - no email/Slack
  digest or background scheduler. Revisit if the in-app version doesn't
  get opened often enough to matter.
- **Briefings are manual, not calendar-driven**: no Google Calendar
  integration - you have to think to open a person's profile on the
  People page and click "Get briefing" rather than it surfacing
  automatically before an actual upcoming meeting.
- **Duplicate detection**: merging two Person rows is manual (People
  page); nothing flags likely duplicates for you.
- **The app is still fundamentally people-centric**: every capture has to
  resolve to a Person - there's no way yet to log a standalone note, idea,
  or personal to-do that isn't about a conversation with someone, or to
  track a recurring non-person "project"/topic thread the way a Person
  accumulates interactions.