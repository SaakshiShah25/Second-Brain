# MyConfía

A personal relationship notebook you talk to. Log a note in plain words or by voice
("Met Priya from Acme today - she's moving to Pune in March"), and MyConfía files it under
the right person, pulls out follow-up tasks and important dates, and lets you ask questions
about everything you've recorded ("When did I last talk to Priya?", "Who did I meet in July?").

It is an installable web app (PWA) with an Android wrapper (Trusted Web Activity) for the Play Store.

- **Backend:** FastAPI (`api/`) on Render
- **Frontend:** React + TypeScript + Vite + Tailwind (`frontend/`) on Vercel
- **Data:** Supabase (Postgres + pgvector + Auth), sensitive text encrypted at rest
- **AI:** Groq-hosted open models (extraction, answers, moderation, speech-to-text) and Cohere embeddings

> For a deeper technical walk-through see [PRODUCT_OVERVIEW.md](PRODUCT_OVERVIEW.md). The history of
> design decisions, and the retired Streamlit prototype, are in [docs/DESIGN_NOTES.md](docs/DESIGN_NOTES.md).

---

## Features

### Capture
- **Type or speak a note.** The app works out who it is about, the date, location, topics, sentiment and a one-line summary.
- **Voice notes** with live captions where the browser supports it, transcribed by Whisper. Silence and background noise are
  detected (on the device and on the server), so an empty recording never turns into a made-up note - you get a clear "didn't catch anything" notice instead.
- **Business-card scan.** Photograph a card; OCR reads it and you confirm the contact before it is saved.
- **Optional location** attached to a note (a map link, or a street address if a Maps key is configured).
- **Smart person matching.** If a name could be more than one person ("Aditi"), you're asked to pick, or to create a new contact - nothing is merged silently.
- **Mentions are linked.** Other people named in a note ("Rahul introduced me to Meera") are linked to their own profiles.
- **Follow-ups become tasks.** "Remind me to call Dad on Friday" creates a task with a due date, resolved in code rather than guessed by the model.
- **Initiatives.** Organise notes into your own categories (Personal, Job, Fitness by default; add, rename, recolour).
- **Sensible rejections.** Content that is too short to be a note, unsafe, or off-topic is declined with a friendly message and example prompts rather than a dead end.

### Ask
- **Natural-language questions** answered from your own notes: "What did Aditi say about the database?", "Last time I met Rahul?", "Who works at Acme?"
- **Time windows.** "Last week", "this month", "in July", "last 30 days", or a year - alone, or combined with a person.
- **Counting questions.** "How many people did I meet this month?", "How many times have I met Priya?" - computed deterministically, not estimated by the model.
- **Semantic search** for fuzzy descriptions ("that skeptical guy from the conference").
- **Traceable answers.** Every answer lists the source notes it came from.
- **Report an answer.** A Report button on every AI answer (reason + optional details) - reports are stored privately and encrypted.
- **AI-generated notice** on every answer, briefing and brief, reminding you the AI can be wrong.
- **Tap-to-fill example prompts** in the empty chat and in the tour, so it's clear what to type.

### People
- **People list and profiles** with role, company, description, contact details, personal notes and a full interaction timeline.
- **Important dates.** Birthdays and anniversaries mentioned in notes are saved separately on the person's profile (add or edit them by hand too), and upcoming ones surface on Today.
- **Relationship cadence.** A profile shows how many days you've noted them, roughly how often, and when you last did.
- **Pre-meeting briefing** - an AI summary of everything you know about a person.
- **Companies.** For each company: who you know there, how many conversations with each, your most recent notes, plus an AI company briefing.
- **Merge and delete** people; quiet-relationship detection ("haven't spoken in a while").

### Today, Notes and Search
- **Today (digest).** Open tasks, overdue items, people to follow up with, and upcoming birthdays/anniversaries, with an AI-written morning brief.
- **Morning email** (optional, on by default) with the same brief.
- **Notes.** Every note in one list, filter by initiative, edit or delete.
- **Search everything.** One search box (Ctrl/Cmd + K, or the magnifier) across people, notes and tasks. It runs on your device over your already-decrypted data, so nothing extra is sent anywhere.
- **Google Calendar.** Optionally push a task with a due date to your calendar.

### Privacy, safety and account
- **Encrypted at rest.** Note text, summaries, personal notes, task text, important dates and reports are encrypted before they reach the database.
- **Row-level security** - every row belongs to a user; the database enforces it.
- **Content moderation** on every input route before anything is processed or stored.
- **App lock.** A PIN (set per device), plus optional fingerprint / face unlock on devices that support it. The PIN always remains as a fallback.
- **Terms gate, interactive tour, Help & FAQ** (Settings), public Privacy Policy and Account Deletion pages.
- **Delete account** from Settings removes all of your data.
- **Rate limits and monthly quotas** per user (free tier), failing safe if quota tables are missing.
- **Personalisation:** colour palettes, light/dark theme, text size.

### Platforms
- Installable PWA, responsive from phone to desktop.
- Android app via Trusted Web Activity (a thin shell around the web app).

---

## How it works (short version)

**Grounded generation.** Anything that can be computed is computed in Python/SQL - dates, counts, ranges,
which records match. The language model only phrases the result. It never does the date maths: it names a phrase
like "last week", and `date_utils.resolve_date_range` turns it into exact days.

**Question pipeline.** `retrieval.parse_query` extracts the person, scope, date range, count type and a semantic phrase.
`api/routers/ask.py` then routes: counting engine -> named person (scope + date filtering) -> date-window listing -> semantic search fallback.
The answer comes back with its source notes.

**Models** (all through Groq except embeddings; see `llm_client.py`)

| Job | Model | Why |
|---|---|---|
| Intent routing and query parsing | `openai/gpt-oss-20b` | Small, cheap and fast; has its own rate-limit budget so routing never starves the main model |
| Content moderation | `openai/gpt-oss-safeguard-20b` | A small safety-tuned model |
| Extraction, answers, briefings, morning brief, card scan | `openai/gpt-oss-120b` | Needs the quality; used once per real request |
| Speech to text | `whisper-large-v3-turbo` | Fast transcription |
| Embeddings | Cohere `embed-english-v3.0` | Hosted, 1024-dim vectors for semantic search |

The two high-volume classification steps (routing and moderation) deliberately use the smallest models.

### Project structure

```
api/                 FastAPI app
  main.py            app, CORS, health, /api/transcribe
  routers/           chat, ask, capture, people, notes, tasks, initiatives,
                     brief, calendar, settings, reports
  schemas.py         request validation (length caps, report reasons, ...)
retrieval.py         query parsing, scope/date selection, counting, source building
extraction.py        note -> structured people / tasks / dates
important_dates.py   birthday & anniversary validation and next-occurrence maths
date_utils.py        relative-date and date-range resolution
db.py                all database access + encryption of sensitive fields
crypto_utils.py      Fernet field encryption
moderation.py, intent.py, voice.py, card_scan.py, morning_brief.py, ...
schema.sql           the full database schema + migrations (numbered sections)
frontend/            React app (pages/, components/, lib/, api/)
docs/DESIGN_NOTES.md archived development log
```

---

## Quick start (local)

```bash
# one-time: Python deps
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# terminal 1 - backend (Swagger UI at http://localhost:8000/docs)
uvicorn api.main:app --reload --port 8000

# terminal 2 - frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

The backend reads `GROQ_API_KEY`, `COHERE_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY` and `ENCRYPTION_KEY` from a repo-root
`.env`; the frontend needs `frontend/.env.development` (see Auth setup below). The database schema is in
`schema.sql` - run its numbered sections in the Supabase SQL editor (re-running is safe; statements are idempotent).
New installs run the whole file; existing installs run the sections added since their last migration.

---

## Setup details

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
just the `pytesseract` pip package), which the `Dockerfile` at the repo
root already handles.

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
   `GROQ_API_KEY`, `COHERE_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`,
   `ENCRYPTION_KEY` (same value as your local one - see "Encrypt-at-rest
   setup" above, don't generate a second key or existing data becomes
   unreadable), `FRONTEND_URL` (set this after step 3), and - only if you
   want Calendar/location working in production -
   `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_OAUTH_REDIRECT_URI`/
   `GOOGLE_MAPS_API_KEY`. Free tier is fine - embeddings are computed via
   Cohere's hosted API now (see `embeddings.py`), not a local model, so
   there's no in-process memory pressure to worry about.
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


---

## Accounts and keys


```bash
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### Groq (free LLM for extraction)

Get a free key: https://console.groq.com/keys

```bash
export GROQ_API_KEY="your_key_here"
```

### Cohere (free hosted embeddings, used for semantic search)

Get a free key (no credit card required): https://cohere.com

```bash
export COHERE_API_KEY="your_key_here"
```

Optional - if unset, capture still works, just without semantic
("that skeptical guy") search. See `embeddings.py`'s module docstring for
why this is a hosted API call rather than a local model.

### Supabase (free Postgres + pgvector, replaces the old SQLite file)

1. Create a free project at https://supabase.com
2. Open **Project -> SQL Editor -> New query**, paste in the contents of
   `schema.sql` from this folder, and run it. This creates:
   - the `person`, `interaction`, `task`, `interaction_person` tables
   - the `pgvector` extension
   - a `vector(1024)` column on `interaction.embedding` (a real vector
     type, not a JSON list stuffed into a text column - 1024 dims to
     match Cohere's `embed-english-v3.0`, see `embeddings.py`)
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

### Encrypt-at-rest setup

Note/person/task content (`raw_text`, `summary`, `description`,
`personal_notes`, task descriptions, etc. — see `crypto_utils.py`'s
docstring for the full list) is encrypted before it's written to
Postgres and decrypted after it's read back, so a direct database
lookup only shows ciphertext. Generate the key once and set it as an
env var, the same way as `SUPABASE_KEY`:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
export ENCRYPTION_KEY="<paste the output above>"
```

> **Back this up somewhere durable (a password manager) before you go
> further.** If `ENCRYPTION_KEY` is ever lost, every row encrypted with
> it becomes permanently unreadable — there is no reset/recovery path,
> the same way there wouldn't be for a lost disk-encryption password.

If you have existing data from before this feature, run the schema.sql
section 22 migration in the Supabase SQL Editor first, then run
`python scripts/encrypt_existing_data.py` once (with `ENCRYPTION_KEY`
already set) to encrypt it in place. A brand-new project has nothing to
migrate — new rows are encrypted automatically from the first capture.

### Sanity check the connection

```bash
python db.py
```

Should print `Connected to Supabase successfully.` If you get a
`SUPABASE_URL / SUPABASE_KEY environment variables not set` error, check
your env vars; if you get a table-not-found error, re-check that
`schema.sql` ran successfully.


---

## Security

| Area | How it works |
|---|---|
| **Moderation** | Every input route is checked before anything is processed or stored. It **fails closed**: if no classifier can be reached the message is refused with a "try again" notice, never waved through. Layers: a free local screen for blatant prompt-injection phrases, then `gpt-oss-safeguard-20b`, then `gpt-oss-20b` with the same written policy (the safeguard model is limited to 3 requests/min on Groq's free tier, so a rate-limited model is skipped until its retry-after passes). Only the five categories in the policy can block - venting, swearing, grief, abuse disclosures, mental health, arrests and similar sensitive notes are explicitly allowed. |
| **Vector search** | `match_interactions()` requires a user id, filters to that user's rows in the `WHERE` clause (using `interaction_user_id_idx`) *before* ranking and `LIMIT`, and is executable only by the backend's service role (`schema.sql` sections 27 and 29). |
| **Row-level security** | Every table has RLS with `auth.uid() = user_id` policies (`schema.sql` sections 10, 25, 26). The backend uses the service-role key, which bypasses RLS, so RLS is the safety net for anything that reaches the database through the public anon key - it is what stops one signed-in user reading another's rows through Supabase's REST API. |
| **Prompts** | No secrets, keys, plan limits or business rules appear in any prompt. User text and stored notes are always fenced in `<note>` / `<records>` / `<data>` tags with an instruction to treat them as data, never commands. |
| **Output validation** | The extraction result is validated by Pydantic (`extraction_schema.py`): types coerced or dropped, string lengths capped, unknown keys discarded, and per-note fan-out capped (10 other people, 10 tasks, 5 important dates, ...). The same validation runs on the `extracted` payload a client sends back on a confirm call, and that call re-runs moderation on the note text. |
| **Input limits** | Request bodies are length-capped (`api/schemas.py`); uploaded audio is capped at 10 MB; per-IP rate limits on every route, tighter on the AI routes; monthly per-user quotas. |
| **App lock** | PIN stored only on the device (never sent to the server) as a salted PBKDF2-SHA256 hash (210,000 rounds); wrong guesses lock the screen for 30 s, doubling to 15 min. Optional biometric unlock via WebAuthn is a local convenience on top of the PIN. |
| **Voice** | Audio is held in memory for one transcription call and sent to Groq's Whisper API. This app never writes it to disk or the database; only the resulting text is kept, and only if you save it as a note. Groq does not retain inference data by default, but may log inputs/outputs for up to 30 days for reliability and abuse monitoring unless Zero Data Retention is switched on in the Groq console (Data Controls). |
| **Encryption** | Field-level, application-side Fernet (AES-128-CBC + HMAC) with one server-held `ENCRYPTION_KEY`. Encrypted: note text, summaries, location/address, task text, a person's description, personal notes, important dates, calendar tokens, AI reports. **Not** encrypted: names, role, company, phone, email, dates, task due dates, and the note embeddings (needed for similarity search). It protects against a database leak, not against the server itself - it is not end-to-end encryption. |

### Sign-up and sign-in protection

Authentication runs directly against Supabase Auth, so bot and brute-force protection is configured there:

1. **CAPTCHA (recommended before launch).** Create a Cloudflare Turnstile widget, set its *secret* in Supabase -> Authentication -> Attack Protection -> CAPTCHA, and set `VITE_TURNSTILE_SITE_KEY` (the *site* key) in Vercel. The sign-in page then shows the check, and Supabase rejects any request without a valid token - including scripted ones that never load the page. With the variable unset, nothing changes.
2. **Rate limits.** Supabase rate-limits sign-ups, sign-ins and emails per IP (see Authentication -> Rate Limits).
3. **Repeated failures.** The sign-in page waits 30 s after five wrong passwords, doubling each time up to 15 min (device-side, `lib/authThrottle.ts`). This is a speed bump for people; the enforcement against scripts is items 1-2.
4. Passwords must be at least 8 characters on sign-up. Consider turning on leaked-password protection in Supabase (Pro plan).

---

## Tests and checks

```bash
cd frontend && npx tsc -b        # type-check the frontend
python -c "import api.main"      # backend imports cleanly
```
