# MyConfía — Version 1.0

A simple, day-to-day notes-and-tasks app you can talk or type to. Installable as a PWA.

**FastAPI backend** (`api/`) + **React / Vite / Tailwind frontend** (`frontend/`), on **Supabase**
(Postgres + pgvector + Auth), **Groq** (LLMs, Whisper) and **Cohere** (embeddings + rerank).

> This branch (`version/1.0`) is deliberately small. People/contacts, the Documents organizer,
> business-card scanning and the Google Calendar/Drive integrations were removed from the UI **and**
> the backend. They still exist on the `ui-revamp-pwa` branch.

## What it does

| | |
|---|---|
| **Chat input (Home)** | One box: type, or tap the mic and talk. It works out whether you are *logging a note* (or a to-do) or *asking a question* about what you logged. Recording can be paused or cancelled; you can pick a category and optionally attach your location. |
| **Notes** | Every note, grouped by date, searchable, filterable by category (initiative). Open one to read, edit or delete it. Categories are yours to manage (Notes → Initiatives). |
| **Tasks (Today)** | Every task pulled out of your notes, in sections: Overdue, Today, Next 7 days, Later, No date, Completed. Tasks can have a date **and a time** ("send the deck by 6pm"). A month **Calendar** view shows what's due when. Tap a task to mark it done, edit its wording / deadline, or flip who owes it. |
| **Morning brief** | A short written summary of what's overdue and due today, written once a day and kept (Refresh rewrites it). Optionally emailed every morning (Settings → Notifications). |

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
`/api/tasks`, `/api/agenda`, `/api/initiatives`, `/api/brief` (`/morning`, `/send-email`, `/send-daily-emails`),
`/api/settings`, `/api/health`. Swagger UI at `http://localhost:8000/docs`.

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
| `GROQ_API_KEY` | extraction, intent, agent, moderation, brief, voice (https://console.groq.com/keys) |
| `COHERE_API_KEY` | embeddings + rerank (https://cohere.com — free trial key). Without it, notes still save and search falls back to keywords |
| `SUPABASE_URL`, `SUPABASE_KEY` | database. `SUPABASE_KEY` is the **service_role** key — server-side only, never in the frontend |
| `ENCRYPTION_KEY` | Fernet key for encrypt-at-rest. Generate once: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` and **back it up** — a lost key makes stored content unreadable |
| `FRONTEND_URL` | CORS for the deployed frontend |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET` | optional: the emailed morning brief |
| `GOOGLE_MAPS_API_KEY` | optional: turns an attached location into a readable address (the map link works without it) |
| `GEMINI_API_KEY` | optional: fallback extractor when Groq is rate limited |
| `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | frontend (anon/public key only) |

### Database

Run `schema.sql` in the Supabase SQL Editor (every statement is `if not exists`, so re-running is safe).
For this version the tables that matter are `interaction`, `task`, `initiative`, `user_preference`,
`search_chunk`, `daily_brief`, `subscription` / `usage_counter`. Older tables from the full app (`person`,
`document`, graph tables…) can stay in place — nothing in v1.0 reads or writes them.

Needed for task times (section 32):

```sql
alter table task add column if not exists due_time time;
notify pgrst, 'reload schema';
```

If a note was saved with a missing-column warning, `scripts/pending_migration.sql` collects the pending changes.

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
- **Morning-brief email**: `.github/workflows/morning-brief.yml` calls `/api/brief/send-daily-emails` daily
  (repo secrets `RENDER_API_URL`, `CRON_SECRET`).

### Maintenance scripts

`scripts/reindex_search.py [email …]` rebuilds the search index; `scripts/view_decrypted.py` prints decrypted rows for QA;
`scripts/apply_migration.py` applies `pending_migration.sql`.

## Free-tier limits worth knowing

Groq: ~8,000 tokens/min per model and ~1,000 requests/day. Cohere trial: 40 calls/min, 1,000/month (rerank is capped at
25/day in code). The app degrades rather than fails: if embeddings are unavailable it searches by keywords; if the
agent can't run, a fixed pipeline answers; if the moderation models are down, messages are refused rather than waved through.

## Not in this version (and where it lives)

People / contacts, memory layer (birthdays, family, preferences), the Documents organizer, Google Drive, Google Calendar sync,
business-card scanning and pre-meeting briefings: branch `ui-revamp-pwa`. Push notifications (8 am brief, reminders 1–2 h before
a task's time) are feasible on a PWA but not built yet.
