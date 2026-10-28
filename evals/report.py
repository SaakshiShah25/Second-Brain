"""Turns a run's results (evals/run.py) into the Markdown report."""

ICON = {True: "✅", False: "❌", None: "⏭️"}


def _short(model: str) -> str:
    return model.split("/")[-1].replace("gpt-oss-", "")


def _pct(score):
    return "-" if score is None else f"{round(score * 100)}%"


def _status(s):
    if s["skipped"]:
        return None
    return s["passed"] == len(s["cases"])


def render(d: dict) -> str:
    out = []
    w = out.append
    suites = d["suites"]
    cap = d.get("capacity") or {}

    w(f"# MyConfía test & eval report: {d['started'][:10]}")
    w("")
    w(f"Run {d['started'].replace('T', ' ')} · mode **{d['mode']}** · {d['minutes']} min. "
      "Regenerate with `.venv/bin/python -m evals.run` (see the end of this report).")
    w("")

    # ---------- summary ----------
    w("## Summary")
    w("")
    w("| Area | Result | Score |")
    w("|---|---|---|")
    for s in suites:
        if s["skipped"]:
            w(f"| {s['name']} | ⏭️ skipped: {s['skipped']} | - |")
            continue
        w(f"| {s['name']} | {ICON[_status(s)]} {s['passed']}/{len(s['cases'])} | {_pct(s['score'])} |")
    w("")

    tokens = {}
    for s in suites:
        for m, t in (s.get("tokens") or {}).items():
            tokens[m] = tokens.get(m, 0) + t
    if tokens:
        w("**AI tokens this run cost:** " + ", ".join(f"{_short(m)} {t:,}" for m, t in sorted(tokens.items()))
          + " (out of 200,000 per model per day).")
        w("")

    # ---------- decisions ----------
    if cap.get("profiles"):
        w("## How many users can the free tier serve?")
        w("")
        w("Active users per day, by usage profile. **With caps** = today's limits of "
          f"{cap['caps'].get('capture', '-')} captures + {cap['caps'].get('question', '-')} questions per user per month "
          "(≈1.7/day each), which stop any one user from using more. **Without caps** = if those were lifted.")
        w("")
        w("| Profile (per active user per day) | Max active users (with caps) | Limit hit first | Max active users (without caps) | Limit hit first |")
        w("|---|---|---|---|---|")
        for name, p in cap["profiles"].items():
            pd = p["per_day"]
            wc, nc = p["with_caps"], p["without_caps"]
            w(f"| **{name}**: {pd['capture']} captures, {pd['question']} questions, {pd['screen_loads']} screen loads "
              f"| **{wc['max_active_users']}** | {wc['binding']} | **{nc['max_active_users']}** | {nc['binding']} |")
        w("")
        w("_The safety check's own model (safeguard-20b) is a soft limit: past ~3 requests/minute or its daily "
          "budget, the check falls back to gpt-oss-20b, so it is never the limit hit first._")
        w("")
        if cap.get("burst"):
            w("**At the same moment** (Groq's per-minute token limit, shared by everyone):")
            w("")
            for action, b in cap["burst"].items():
                w(f"- ≈ **{b['per_minute']} {action}s per minute** across all users before the AI is throttled "
                  f"(binding: {_short(b['binding_model'])}). Beyond that, users get a short wait or the 'AI is busy' message.")
            w("")
        w("<details><summary>Every limit, per profile (users it allows)</summary>")
        w("")
        for name, p in cap["profiles"].items():
            for label, key in (("with caps", "with_caps"), ("without caps", "without_caps")):
                w(f"**{name}, {label}**")
                w("")
                for k, v in p[key]["users_by_constraint"].items():
                    w(f"- {k}: {v:,} users")
                w("")
        w("</details>")
        w("")

        w("### What one action costs (measured)")
        w("")
        w("| Action | Samples | AI tokens per model | AI calls per model | Cohere calls |")
        w("|---|---|---|---|---|")
        for action, c in cap["costs"].items():
            w(f"| {action} | {c['samples']} | " + ", ".join(f"{_short(m)} {t:,}" for m, t in c["tokens"].items())
              + " | " + ", ".join(f"{_short(m)} {n}" for m, n in c["calls"].items())
              + f" | {c['cohere']} in request" + (f" + {cap.get('cohere_background_per_capture', 0)} search indexing"
                                                   if action == "capture" else "") + " |")
        w("")
        if cap.get("limits"):
            w("### Groq limits as Groq reported them")
            w("")
            w("| Model | Tokens / minute | Requests / day | Tokens / day |")
            w("|---|---|---|---|")
            for m, l in cap["limits"].items():
                w(f"| {_short(m)} | {l['tpm'] or '?'} | {l['rpd'] or '?'} | {l['tpd']:,} (documented) |")
            w("")
        st = d.get("storage") or {}
        if st:
            w(f"**Storage:** ≈ {st['bytes_per_note'] / 1024:.1f} KB per note including its search-index entries and "
              f"vectors ({st['chunks_per_note']} index entries and {st['tasks_per_note']} tasks per note in the sample). "
              f"The 500 MB free database holds roughly **{int(500e6 / st['bytes_per_note']):,} notes**.")
            w("")

    # ---------- suites ----------
    w("## Details")
    w("")
    for s in suites:
        w(f"### {ICON[_status(s)]} {s['name']}")
        w("")
        if s["about"]:
            w(f"_{s['about']}_")
            w("")
        if s["skipped"]:
            w(f"Skipped: {s['skipped']}")
            w("")
            continue
        metrics = s.get("metrics") or {}
        if metrics and s["name"] not in ("Load & limits",):
            for k, v in metrics.items():
                w(f"- **{k}:** {v}")
            w("")
        if s["name"] == "Load & limits":
            _load(w, metrics)
        if s.get("tokens"):
            w("Tokens: " + ", ".join(f"{_short(m)} {t:,}" for m, t in s["tokens"].items())
              + " · calls: " + ", ".join(f"{k.replace('openai/gpt-oss-', '')} {n}" for k, n in s["calls"].items()))
            w("")
        for n in s.get("notes") or []:
            w(f"> {n}")
            w("")
        failing = [c for c in s["cases"] if not c["passed"]]
        detailed = s["name"] not in ("Backend tests (offline)", "Frontend tests (offline)")
        if detailed and s["cases"]:
            w("| | Case | Detail | Time |")
            w("|---|---|---|---|")
            for c in s["cases"]:
                detail = (c["detail"] or "").replace("|", "\\|").replace("\n", " ")
                tag = f" `{c['tag']}`" if c.get("tag") else ""
                w(f"| {ICON[c['passed']]} | {c['name'][:90]}{tag} | {detail[:260]} | {c['ms'] / 1000:.1f}s |" if c["ms"]
                  else f"| {ICON[c['passed']]} | {c['name'][:90]}{tag} | {detail[:260]} | |")
            w("")
        elif failing:
            for c in failing:
                w(f"- ❌ {c['name']}: {c['detail']}")
            w("")

    # ---------- how to run ----------
    w("## Re-running")
    w("")
    w("```")
    w(".venv/bin/python -m evals.run            # everything: offline tests, live AI evals, load, capacity")
    w(".venv/bin/python -m evals.run --quick    # smaller samples, about a third of the tokens")
    w(".venv/bin/python -m evals.run --offline  # free tests only (also run in CI on every push)")
    w("```")
    w("")
    w("The live parts need the backend's `.env` and, for load tests, the backend running "
      "(`.venv/bin/uvicorn api.main:app --port 8000`). They use their own accounts "
      "(eval@ and load1-10@myconfia.local), never real users' data, and spend part of the shared daily Groq "
      "budget, so run them off-peak. Datasets are in `evals/datasets/`; add a case whenever a bug is found.")
    w("")
    return "\n".join(out)


def _load(w, m):
    if "health" in m:
        h = m["health"]
        w(f"- **Health check:** p50 {h['p50_ms']} ms, p95 {h['p95_ms']} ms")
    if "concurrency" in m:
        w("")
        w("| Users at once | Requests | p50 | p95 | Max | Rate-limited | Errors | Throughput |")
        w("|---|---|---|---|---|---|---|---|")
        for users, s in m["concurrency"].items():
            w(f"| {users} | {s['requests']} | {s['p50_ms']} ms | {s['p95_ms']} ms | {s['max_ms']} ms | {s['rate_limited']} "
              f"| {s['errors']} | {s['throughput_rps']} req/s |")
        w("")
    if "rate_limit" in m:
        r = m["rate_limit"]
        w(f"- **Rate limit:** a burst of {r['burst_of']} requests from one user: {r['allowed']} allowed, "
          f"{r['rate_limited']} refused with 429; another user unaffected: {r['other_user_unaffected']}")
    if "notes_scaling" in m:
        w("")
        w("| Notes in the account | Notes screen p50 | Payload |")
        w("|---|---|---|")
        for n, s in m["notes_scaling"].items():
            w(f"| {n} | {s['p50_ms']} ms | {s['payload_kb']} KB |")
        w("")
    if m.get("server_memory_mb"):
        sm = m["server_memory_mb"]
        w(f"- **Server memory (local):** {sm['before']} MB → {sm['after']} MB after the load (Render free: 512 MB)")
    w("")
