# MyConfía — Version 1.0

A simple notes-and-tasks app you can talk or type to, with everything sorted into your own categories. Installable as a PWA.

**FastAPI backend** (`api/`) + **React / Vite / Tailwind frontend** (`frontend/`), on **Supabase**
(Postgres + pgvector + Auth), **Groq** (LLMs, Whisper) and **Cohere** (embeddings + rerank).

> This branch (`version/1.0`) is deliberately small. People/contacts, the Documents organizer,
> business-card scanning, the Google Calendar/Drive integrations, the calendar view and the morning brief were removed from the UI **and**
> the backend. They still exist on the `ui-revamp-pwa` branch. Production setup (invite-only access, backups,
> alerts, the admin page) is in `PRODUCTION_SETUP.md`.

## What it does

| | |
|---|---|
| **Chat input (Home)** | One box: type, or tap the mic and talk. It works out whether you are *logging a note* (or a to-do) or *asking a question* about what you logged. Recording can be paused or cancelled; you can pick a category and optionally attach your location. A capture becomes **items** (to-dos, list entries, routines, dates) and - only when there is something to remember - a note: "add Dune to my reading list" saves just the item, "met Priya, send her the deck" saves a note plus a to-do. The reply shows what went where, each line tappable, with **Undo**. |
| **Today** | What needs you now, across every list: overdue, due today (timed ones by time, routines, dates) and the coming week - birthdays included. Undated things stay on their lists. |
| **Lists** | The main **Tasks** list, plus lists made as you go - Movies, Books, Groceries, Birthdays, Routines, Startup ideas - each with a quick-add box and its done items folded away. Items can have a date, a time, a repeat (daily, weekdays, weekly, monthly, yearly, every N hours) and a detail; ticking a repeating item moves it to its next date. |
| **Notes** | Organised **by initiative**: a block per initiative showing its newest key points and how much it holds ("3 notes · 2 decisions · 2 concerns"); tap one to open its page: everything extracted from its notes, as bullets grouped under a short topic label, with **Decisions:** and **Concerns:** as bold sub-lists under each, each bullet dated and tappable to open the note it came from. **All of that is extracted once, when a note is logged - opening Notes never calls an AI model.** "Source notes" lists the notes exactly as you wrote them; open one to read, edit or delete it. An initiative's page also gathers everything else that belongs to it - its open to-dos and its list entries ("🎬 Movies", "📚 Books") - so it is the whole map of what belongs where; each item's sheet has a Category row to change that in one tap, and the chips at the foot of Today and Lists narrow them to one category. Initiatives (name, colour, order) are yours to manage. |
| **Task reminders** | Optional push notifications at **9 AM and 5 PM** (each device's own time zone) listing your open tasks grouped by category, plus a **reminder on any task** at the day and time you pick (or at its due time). Turn them on per device in Settings → Notifications. See "Task reminders" below. |
| **Tasks** | Every task pulled out of your notes, **grouped under its initiative** (never by date), with the nearest deadline first inside each. Tasks can have a date and a time ("send the deck by 6pm"); an overdue date shows in red. Tap a task to tick it off, edit its wording or deadline, flip who owes it, or jump to the note it came from. Each task has a **priority** mark (`!!!` red = high, `!!` amber = normal, `!` green = low - high ones sort first; the tick circle takes the same colour), a **bell** to set a reminder (on the due date, 1-7 days before, or any date; you get a push at 9 AM that day) and can be **dragged onto another category** (press and hold on a phone) or moved with **Move** in its sheet - and, after a move, you are asked whether the note it came from should move too (it carries its other tasks along). |

Also: a name for the greeting (typed at signup, asked once after sign-in, editable in Settings → Your name; kept in the Supabase account's metadata, never guessed from the email), sign-in (email or Google via Supabase Auth), light/dark themes, text size, app lock, a first-run tour,
usage mode (work / personal / both) that tunes wording, account deletion, and encrypted-at-rest content.

## How a message flows

```
text / voice ──► moderation (regex → safeguard model → fallback model, fail-closed)
             ──► intent: capture | ask | out of scope
capture ─► extraction (one LLM call: pulls out key points, decisions, concerns and tasks and files each item under
           its own initiative - or proposes a broad new one when none fits, which the user confirms, renames or
           declines in the reply before it exists); each fact lands in exactly one list, repeats are also removed in code)
        ─► one note per initiative mentioned (a note about one subject stays one note; picking a category yourself
           keeps the whole message together); tasks follow their item's initiative. The original text is stored once,
           on the first note; the others point at it (`interaction.source_id`) and are deleted with it
        ─► reply shown as one coloured section per initiative; note + tasks saved, queued for the search index
ask     ─► retrieval agent: Round 0 plain-code search (+ task list if it sounds like to-dos),
           planner (≤3 rounds, tools: search / read_notes / list_tasks), writer answers with sources
           └ if the agent can't run: embed the question → closest notes → answer (api/routers/ask.py)
```

Search is hybrid: pgvector similarity + BM25 keywords, fused, then reranked by Cohere (`search_index.py`).

## API surface

`/api/chat` (+`/stream`), `/api/capture` (+`/voice`), `/api/ask`, `/api/transcribe`, `/api/notes`,
`/api/tasks`, `/api/initiatives`, `/api/push`, `/api/settings`, `/api/admin`, `/api/health`. Swagger UI at `http://localhost:8000/docs`.

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

For task priority, per-task reminders and moving a task to another category, run `scripts/migration_38_task_options.sql`
(schema.sql section 38). Until then tasks work as before and those three say to run it. To choose a *time* for a
task's reminder (instead of the default 9 AM), also run `scripts/migration_41_reminder_time.sql` (section 41).

For a message that lands in several initiatives to store the original text once (instead of on every note),
run `scripts/migration_37_source_note.sql` (schema.sql section 37). Without it everything still works, with a copy per note.

For lists, items without a note, repeats and per-item reminders, run `scripts/migration_40_lists.sql` (schema.sql section 40)
**before** deploying the backend that uses it: the Today, Lists and Tasks pages read the new `item_list` table.

If a note was saved with a missing-column warning, `scripts/pending_migration.sql` collects the pending changes.

### Task reminders (push notifications)

Web Push, sent by the backend (`push_notify.py`), shown by the app's service worker (`frontend/public/push-sw.js`).

1. **Keys, once:** `python scripts/generate_vapid_keys.py you@example.com`, then set the three `VAPID_*` values on Render
   (and locally in `.env`). Never change the pair afterwards — devices subscribed with the old one stop working.
2. **Database:** run `scripts/migration_36_push.sql` (schema.sql section 36, the `push_subscription` table) in the Supabase SQL Editor.
3. **Scheduler:** a Supabase pg_cron job calls `POST /api/push/send-due` every minute with the `CRON_SECRET` header. Set it
   up by filling in the backend URL and the `CRON_SECRET` already on Render in `scripts/migration_42_reminder_cron.sql` and
   running it in the SQL Editor (don't commit the filled-in copy). `.github/workflows/task-reminders.yml` is kept for firing one tick by hand.
   The 9 AM / 5 PM summary goes out at most once a day each, inside a 90-minute window. A reminder set on a task (the bell:
   a day and a time, or "at its due time") goes out on the first run after that moment in the device's time zone, once,
   and is still delivered for 3 days if a run was missed.
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

### Trying it out

`docs/TEST_PACK.md` is a manual test pack: notes to paste into the chat, what each should produce, questions to ask afterwards,
and screens to check. `python scripts/try_note.py "your text"` previews how any message would be handled (route, category,
summary, tasks) without saving anything.

### Maintenance scripts

`scripts/reindex_search.py [email …]` rebuilds the search index; `scripts/view_decrypted.py` prints decrypted rows for QA;
`scripts/apply_migration.py` applies `pending_migration.sql`.

## Free-tier limits worth knowing

Groq: ~8,000 tokens/min per model and ~1,000 requests/day. Cohere trial: 40 calls/min, 1,000/month (rerank is capped at
25/day in code). The app degrades rather than fails: if embeddings are unavailable it searches by keywords; if the
agent can't run, a fixed pipeline answers; if the moderation models are down, messages are refused rather than waved through.

## Not in this version (and where it lives)

People / contacts, memory layer (birthdays, family, preferences), the Documents organizer, Google Drive, Google Calendar sync,
business-card scanning, pre-meeting briefings, the calendar view and the morning brief: branch `ui-revamp-pwa`.
Reminders timed to an individual task's due time (rather than the fixed 9 AM / 5 PM list) aren't built.
