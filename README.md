# MyConfía — Version 1.0

A simple notes-and-tasks app you can talk or type to, with everything sorted into your own categories. Installable as a PWA.

**FastAPI backend** (`api/`) + **React / Vite / Tailwind frontend** (`frontend/`), on **Supabase**
(Postgres + pgvector + Auth), **Groq** (LLMs, Whisper) and **Cohere** (embeddings + rerank).

> This branch (`version/1.0`) is deliberately small. People/contacts, the Documents organizer,
> business-card scanning, the calendar view and the morning brief were removed from the UI **and**
> the backend. They still exist on the `ui-revamp-pwa` branch.

## What it does

| | |
|---|---|
| **Chat input (Home)** | One box: type, or tap the mic and talk. It works out whether you are *logging a note* (or a to-do) or *asking a question* about what you logged. Recording can be paused or cancelled; you can pick a category and optionally attach your location. |
| **Notes** | Every note, shown **under its category** (initiative) in the order your categories are listed, newest first, with "Others" for uncategorised ones. Search, filter by category, open one to read, edit or delete it. Categories are yours to manage (Notes → Initiatives). |
| **Task reminders** | Optional push notifications at **9 AM and 5 PM** (each device's own time zone) listing your open tasks grouped by category. Turn them on per device in Settings → Notifications. See "Task reminders" below. |
| **Tasks** | Every task pulled out of your notes, **grouped by category** too, with the nearest deadline first. Tasks can have a date and a time ("send the deck by 6pm"); an overdue date shows in red. Tap a task to mark it done, edit its wording / deadline, or flip who owes it. Completed ones are tucked away at the bottom. |

Also: sign-in (email or Google via Supabase Auth), light/dark themes, text size, app lock, a first-run tour,
usage mode (work / personal / both) that tunes wording, account deletion, and encrypted-at-rest content.

## How a message flows

```
text / voice ──► moderation (regex → safeguard model → fallback model, fail-closed)
             ──► intent: capture | ask | out of scope
capture ─► extraction (one LLM call: summary, category, decisions, concerns, tasks with date/time)
        ─► note + tasks saved, queued for the search index
ask     ─► retrieval agent: Round 0 plain-code search (+ task list if it sounds like to-dos),
           planner (≤3 rounds, tools: search / read_notes / list_tasks), writer answers with sources
           └ if the agent can't run: embed the question → closest notes → answer (api/routers/ask.py)
```

Search is hybrid: pgvector similarity + BM25 keywords, fused, then reranked by Cohere (`search_index.py`).

## API surface

`/api/chat` (+`/stream`), `/api/capture` (+`/voice`), `/api/ask`, `/api/transcribe`, `/api/notes`,
`/api/tasks`, `/api/initiatives`, `/api/push`, `/api/settings`, `/api/health`. Swagger UI at `http://localhost:8000/docs`.

## Run it locally

```bash
# one-time
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && cd ..

# terminal 1 - backend
uvicorn api.main:app --reload --port 8000

# terminal 2 - frontend
cd frontend && npm run dev          # http://localhost:5173
```

Backend settings go in a repo-root `.env`; the frontend's go in `frontend/.env.development`.

### Environment

| Variable | Needed for |
|---|---|
| `GROQ_API_KEY` | extraction, intent, agent, moderation, voice (https://console.groq.com/keys) |
| `COHERE_API_KEY` | embeddings + rerank (https://cohere.com — free trial key). Without it, notes still save and search falls back to keywords |
| `SUPABASE_URL`, `SUPABASE_KEY` | database. `SUPABASE_KEY` is the **service_role** key — server-side only, never in the frontend |
| `ENCRYPTION_KEY` | Fernet key for encrypt-at-rest. Generate once: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` and **back it up** — a lost key makes stored content unreadable |
| `FRONTEND_URL` | CORS for the deployed frontend |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` | task reminders (below) |
| `GOOGLE_MAPS_API_KEY` | optional: turns an attached location into a readable address (the map link works without it) |
| `GEMINI_API_KEY` | optional: fallback extractor when Groq is rate limited |
| `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | frontend (anon/public key only) |

### Database

Run `schema.sql` in the Supabase SQL Editor (every statement is `if not exists`, so re-running is safe).
For this version the tables that matter are `interaction`, `task`, `initiative`, `user_preference`,
`search_chunk`, `subscription` / `usage_counter`. Older tables from the full app (`person`,
`document`, graph tables…) can stay in place — nothing in v1.0 reads or writes them.

Needed for task times (section 32):

```sql
alter table task add column if not exists due_time time;
notify pgrst, 'reload schema';
```

If a note was saved with a missing-column warning, `scripts/pending_migration.sql` collects the pending changes.

### Task reminders (push notifications)

Web Push, sent by the backend (`push_notify.py`), shown by the app's service worker (`frontend/public/push-sw.js`).

1. **Keys, once:** `python scripts/generate_vapid_keys.py you@example.com`, then set the three `VAPID_*` values on Render
   (and locally in `.env`). Never change the pair afterwards — devices subscribed with the old one stop working.
2. **Database:** run `schema.sql` section 33 (the `push_subscription` table) in the Supabase SQL Editor.
3. **Scheduler:** `.github/workflows/task-reminders.yml` calls `POST /api/push/send-due` every 30 minutes with the
   `CRON_SECRET` header (repo secrets `RENDER_API_URL` and `CRON_SECRET`; the same `CRON_SECRET` must be set on Render).
   Each device gets each reminder at most once a day, inside a 90-minute window after 9:00 / 17:00 local time.
4. **Per device:** Settings → Notifications → Task reminders. iPhone needs iOS 16.4+ and the app added to the Home Screen first.
   The Android app (a Trusted Web Activity) shows them only if notification delegation is enabled in that app.

Nothing is sent when there are no open tasks. Push services relay the message but can't read it (it's encrypted to the device).

### Sign-in (Supabase Auth)

1. Authentication → Providers → Email is on by default (signups may need email confirmation; turn "Confirm email" off while testing).
2. Optional: enable the Google provider in the same screen for "Continue with Google".
3. Put `VITE_SUPABASE_URL` and the **anon** key in `frontend/.env.development`.
4. After deploying, add the frontend URL under Authentication → URL Configuration.

### Tests

```bash
source venv/bin/activate
for t in tests/test_*.py; do python "$t"; done        # backend (plain python, no pytest needed)
cd frontend && npx tsc -p tsconfig.app.json --noEmit  # frontend types
```

### Deployment (Render + Vercel)

- **Backend → Render** as a Docker web service (`Dockerfile`, `render.yaml` lists every env var; secrets are set in the dashboard).
  Free tier sleeps after ~15 min idle; the first request after a gap takes 30–60 s.
- **Frontend → Vercel** with root directory `frontend`; `frontend/vercel.json` handles the SPA fallback.
  Set `VITE_API_URL` to the Render URL, then set `FRONTEND_URL` on Render to the Vercel URL and redeploy.

### Maintenance scripts

`scripts/reindex_search.py [email …]` rebuilds the search index; `scripts/view_decrypted.py` prints decrypted rows for QA;
`scripts/apply_migration.py` applies `pending_migration.sql`.

## Free-tier limits worth knowing

Groq: ~8,000 tokens/min per model and ~1,000 requests/day. Cohere trial: 40 calls/min, 1,000/month (rerank is capped at
25/day in code). The app degrades rather than fails: if embeddings are unavailable it searches by keywords; if the
agent can't run, a fixed pipeline answers; if the moderation models are down, messages are refused rather than waved through.

## Not in this version (and where it lives)

People / contacts, memory layer (birthdays, family, preferences), the Documents organizer, Google Drive, Google Calendar sync,
business-card scanning, pre-meeting briefings, the calendar view and the morning brief (in-app and emailed): branch `ui-revamp-pwa`.
Reminders timed to an individual task's due time (rather than the fixed 9 AM / 5 PM list) aren't built.
