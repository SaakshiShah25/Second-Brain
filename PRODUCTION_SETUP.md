# MyConfía: production setup checklist

Everything here stays on free plans. The code side is done; these are the dashboard steps only you can do.
Tick each box as you go.

**Already done:**
- Database migration (sections 33–35): initiative order, saved initiative pages, the event log for analytics.
- `RESEND_API_KEY` and `ALERT_EMAIL` set in the local `.env`. A test alert was sent to sanket3shah@gmail.com.

---

## 1. Commit, push, pick the deploy branch (most important)

- [ ] Ask Claude to **commit and push** the work on `version/1.0`.
- [ ] Decide what Render and Vercel deploy from. `main` is behind `version/1.0`, so either:
  - merge `version/1.0` into `main` through a pull request on GitHub, **or**
  - point both Render and Vercel at the `version/1.0` branch.

## 2. Render: backend environment variables (most important)

Render dashboard → your service (`second-brain-api`) → **Environment** → add or update:

| Variable | Value | Why |
|---|---|---|
| `RESEND_API_KEY` | your `re_…` key, the same as in `.env` | Sends alerts and the daily report |
| `ALERT_EMAIL` | `sanket3shah@gmail.com` | Where every alert goes; also who can open the admin page |
| `ALLOWED_EMAILS` | e.g. `sanket3shah@gmail.com, friend@x.com` (or `@company.com` for a whole domain) | Invite-only. Anyone not listed sees "You're not on the list yet". |
| `APP_ENV` | `production` | Only your real frontend may call the API |
| `FRONTEND_URL` | your Vercel URL, e.g. `https://myconfia.vercel.app` | CORS (which websites may call the API) |
| `CRON_SECRET` | a long random string (see below) | Protects the scheduled jobs; must match GitHub |
| `GEMINI_FALLBACK` | `off` | Gemini's free tier may use data for training |

Keep the variables that are already there (`GROQ_API_KEY`, `COHERE_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `ENCRYPTION_KEY`, …).

To make a random string, run this in Terminal: `openssl rand -hex 32`

Render redeploys by itself after you save.

**To invite someone later:** add their email to `ALLOWED_EMAILS` and save. You'll also get an email whenever someone who isn't on the list tries to sign in.

## 3. GitHub: repo secrets for the scheduled jobs

GitHub → `SaakshiShah25/Second-Brain` → **Settings → Secrets and variables → Actions → New repository secret**.
The repo belongs to Saakshi, so they may need to add these or give you admin access.

| Secret | Value | Used by |
|---|---|---|
| `RENDER_API_URL` | your Render backend URL, e.g. `https://second-brain-api-xxxx.onrender.com` | Morning brief, daily report |
| `CRON_SECRET` | **the same value** as on Render | Morning brief, daily report |
| `DATABASE_URL` | Supabase → **Connect** → *Session pooler* connection string, with the password filled in | Nightly backup |
| `BACKUP_PASSPHRASE` | a long random string (`openssl rand -hex 32`) | Encrypts the nightly backup |

`RENDER_API_URL` and `CRON_SECRET` may already exist for the morning-brief email. If so, just check that they match Render.

What runs automatically once these are set:

| Workflow | When (IST) | What it does |
|---|---|---|
| CI | every push | Runs the tests, type check and build |
| Morning brief | 7:30am | Emails the brief to users who opted in |
| Daily report | 9:00pm | Emails you users, usage, AI budget, limits hit and errors; deletes events older than 30 days |
| Nightly backup | 3:00am | Encrypted database dump, kept 14 days under **Actions → Nightly backup → a run → Artifacts** |

## 4. UptimeRobot: uptime monitor and keep-awake (free)

- [ ] Sign up at https://uptimerobot.com with sanket3shah@gmail.com.
- [ ] **Add New Monitor** → type **HTTP(s)** → URL `https://<your-render-url>/api/health` → interval **5 minutes**.
- [ ] Alert contact: sanket3shah@gmail.com.

Why it matters:
- Render's free plan sleeps after 15 minutes idle, and Supabase's free plan pauses after a quiet week. The ping keeps both awake, because the health check runs a real database query.
- It emails you if the server is down. That's the one problem the app can't email you about itself.

## 5. Save two secrets offline

Put both in a password manager, plus one offline copy:

- [ ] `ENCRYPTION_KEY` (from `.env`, also on Render). **If it's lost, every note becomes unreadable, backups included.**
- [ ] `BACKUP_PASSPHRASE` (from step 3). Needed to open a backup.

## 6. Supabase: auth URLs

Supabase → **Authentication → URL Configuration**:

- [ ] **Site URL:** your Vercel URL.
- [ ] **Redirect URLs:** add your Vercel URL (e.g. `https://myconfia.vercel.app/**`).

Without this, sign-up confirmation and password-reset links point to the wrong place.

## 7. Vercel: frontend environment variables

Vercel → project → **Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_API_URL` | your Render backend URL |
| `VITE_SUPABASE_URL` | same as `frontend/.env.development` |
| `VITE_SUPABASE_ANON_KEY` | same as `frontend/.env.development` |

Then redeploy.

## 8. After it's deployed: test once

- [ ] Open the app with an email that is in `ALLOWED_EMAILS`, then with one that isn't. The second should see "You're not on the list yet", and you should get an email about it.
- [ ] Settings → **Admin → Usage, limits & errors** (visible only to `ALERT_EMAIL`). It should show the AI budget and usage.
- [ ] GitHub → Actions → **Daily report** → *Run workflow*. You should get the report email.
- [ ] GitHub → Actions → **Nightly backup** → *Run workflow*. The run should finish with an artifact.
- [ ] Tell Claude the results, and it will check everything end to end.

---

## Optional

- **Rotate the Resend key.** It was pasted in chat. In Resend, create a new key, update `.env` and Render, then delete the old key.
- **Verify a sending domain in Resend.** Only needed if customers should receive the morning-brief email. Alerts to you work without it.
- **Sentry** (free) for extra error tracking: create a project, then set `SENTRY_DSN` on Render. Not required; the built-in alerts already cover errors.

## What you'll get by email (sanket3shah@gmail.com)

| Alert | When |
|---|---|
| Error in … (with a reference code) | Any server error or app crash. The user sees the same code. |
| AI budget past 80% | A Groq model has used 80% of its free daily tokens |
| Groq daily limit hit | Captures and questions fail until it resets |
| Monthly cap reached | A user hit their 50 captures or 50 questions for the month |
| Cohere limit hit | Search falls back to keyword-only |
| Not on the invite list | Someone signed in who isn't in `ALLOWED_EMAILS` |
| Daily report | Every evening at 9pm IST |

The same alert is sent at most once an hour, and at most 40 alerts a day (Resend's free plan allows 100 emails a day).

## Free-tier capacity (shared by all users)

These are measured numbers. The admin page shows the live figures.

- About **5.1k AI tokens per capture** and **4.7k per question**. Each model allows 200k tokens a day, so expect roughly **35–50 captures plus 25–40 questions a day** across everyone.
- Each user is capped at **50 captures and 50 questions a month**. Change this in `entitlements.py` (`FREE_LIMITS`).
- Cohere's trial key allows **1,000 calls a month**. Search reranking is capped at 25 a day.
