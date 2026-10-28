# Tests, evals and capacity

One command checks whether MyConfía still works and what the free tier can handle. It then writes a report to `reports/` (`latest.md` is always the most recent).

```
.venv/bin/python -m evals.run            # everything (~20 min, ~110K Groq tokens)
.venv/bin/python -m evals.run --quick    # smaller samples (~8 min, ~35K tokens)
.venv/bin/python -m evals.run --offline  # free tests only, a few seconds (also run by CI on every push)
.venv/bin/python -m evals.run --skip-load --base-url https://<render-url>
```

The load tests need the backend running: `.venv/bin/uvicorn api.main:app --port 8000`.

## What runs

| Layer | Where | Cost | What it checks |
|---|---|---|---|
| Backend tests | `tests/` (pytest) | free, offline | Security (invite list, rate-limit buckets, CORS), error handling and reference codes, alerts and throttling, token budget, admin analytics maths, initiative pages, monthly caps, intent safeguards |
| Frontend tests | `frontend/src/**/*.test.ts` (vitest) | free, offline | Notes shown as points, the Today/Notes filter, distinct initiative colours, initiative order |
| Intent eval | `evals/components.py` + `datasets/intent.json` | Groq 20b | capture, ask or out-of-scope, including imperative to-dos, Hinglish and venting. Refusing a real note is reported separately. |
| Safety eval | `datasets/moderation.json` | Groq safeguard + 20b | Real notes (venting, health, money) let through; injection, weapons, malware, fraud and hate blocked |
| Extraction eval | `datasets/extraction.json` | Groq 120b | Right initiative, to-dos with owner and resolved deadline, short bullet points without the to-dos repeated, names capitalised |
| Initiative pages | `components.eval_digest` | Groq 20b | Sections fit the subject, points are short, nothing repeated, key facts kept |
| End to end | `evals/e2e.py` + `datasets/e2e.json` | Groq + Cohere | Real sign-in, then captures and questions through `/api/chat/stream` on a wiped and re-seeded eval account; answers must contain the facts and must not invent any |
| Load and limits | `evals/load.py` | free (no AI) | Latency with 1/5/10 users at once, the per-user rate limit, Notes screen time as notes grow, server memory |
| Capacity | `evals/capacity.py` | free | Measured cost per capture and question, plus Groq's own limit headers and the free-tier limits, gives users supported per usage profile and which limit hits first |

The live parts use dedicated accounts (`eval@` and `load1-10@myconfia.local`), never real users' data. They don't email the admin. They pace themselves under Groq's per-minute limit, so they measure the app rather than the throttle. They do spend part of the shared daily AI budget, so run them off-peak.

## Adding a case

When a bug is found, add the input that broke to the matching file in `datasets/`, with the expected result. It is then checked on every run.
