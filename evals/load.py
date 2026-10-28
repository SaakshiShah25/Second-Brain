"""Load and limit tests against a running backend over HTTP (default
http://localhost:8000; pass --base-url for a deployed one). No AI calls -
these measure the API, the database and the rate limits, not Groq (AI
capacity is modelled from measured token costs in capacity.py instead of
burning the free budget in a load test).

  1. Baseline: /api/health latency.
  2. Concurrency: N users opening the app at once (each "screen load" =
     the 4 calls the app makes), separate accounts so per-user rate limits
     don't distort it. Latency percentiles, errors, throughput.
  3. Rate limit: one user bursting past the per-minute limit gets 429s.
  4. Scaling: Notes screen time and payload as one user's notes grow.
  5. Server memory (local runs only).
"""

import statistics
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import requests

from evals.common import LOAD_USERS, Case, Suite, ensure_user, sign_in, wipe_user_data

import db

SCREEN = ["/api/settings", "/api/initiatives", "/api/tasks?status_filter=all", "/api/notes"]


def _pct(values, p):
    if not values:
        return None
    values = sorted(values)
    return values[min(len(values) - 1, int(round(p / 100 * (len(values) - 1))))]


def _get(base, path, token=None):
    t = time.time()
    try:
        r = requests.get(base + path, headers={"Authorization": f"Bearer {token}"} if token else {}, timeout=60)
        return r.status_code, (time.time() - t) * 1000, len(r.content)
    except requests.RequestException:
        return 0, (time.time() - t) * 1000, 0


def _summary(results):
    ms = [m for s, m, _ in results if s == 200]
    return {
        "requests": len(results),
        "ok": sum(1 for s, _, _ in results if s == 200),
        "rate_limited": sum(1 for s, _, _ in results if s == 429),
        "errors": sum(1 for s, _, _ in results if s not in (200, 429)),
        "p50_ms": round(_pct(ms, 50) or 0), "p95_ms": round(_pct(ms, 95) or 0), "max_ms": round(max(ms) if ms else 0),
    }


def _server_rss_mb(base):
    if "localhost" not in base and "127.0.0.1" not in base:
        return None
    try:
        port = base.rsplit(":", 1)[-1].strip("/")
        pids = subprocess.run(["lsof", "-t", f"-iTCP:{port}", "-sTCP:LISTEN"], capture_output=True, text=True).stdout.split()
        # with --reload the listener is a supervisor; the app runs in its child
        for pid in list(pids):
            pids += subprocess.run(["pgrep", "-P", pid], capture_output=True, text=True).stdout.split()
        rss = 0
        for pid in set(pids):
            out = subprocess.run(["ps", "-o", "rss=", "-p", pid], capture_output=True, text=True).stdout.strip()
            rss = max(rss, int(out or 0))
        return round(rss / 1024)
    except Exception:
        return None


def _seed_notes(user_id, n):
    """n plain notes straight into the table (no AI) - for the scaling test."""
    wipe_user_data(user_id)
    rows = [db._encrypt_fields("interaction", {
        "user_id": user_id, "raw_text": f"Load test note {i} about pricing, hiring and the roadmap.",
        "summary": f"- Load test note {i}\n- Discussed pricing and hiring\n- Next step on the roadmap",
        "date": date.today().isoformat(), "decisions": [], "concerns": [], "topics": [], "sentiment": [], "extracted_facts": {},
    }) for i in range(n)]
    for start in range(0, len(rows), 200):
        db.get_client().table("interaction").insert(rows[start:start + 200]).execute()


def run(base="http://localhost:8000", quick=False) -> Suite:
    suite = Suite("Load & limits", f"HTTP against {base}. No AI calls.")
    try:
        requests.get(base + "/api/health", timeout=60)
    except requests.RequestException:
        suite.skipped = f"backend not reachable at {base} - start it (uvicorn api.main:app) and re-run"
        return suite

    # 1. baseline
    health = [_get(base, "/api/health") for _ in range(10)]
    suite.metrics["health"] = _summary(health)
    rss_before = _server_rss_mb(base)

    # accounts
    n_users = 5 if quick else len(LOAD_USERS)
    tokens = []
    for email in LOAD_USERS[:n_users]:
        ensure_user(email)
        tokens.append(sign_in(email))

    # 2. concurrency
    loads_per_user = 5
    levels = [1, 5] if quick else [1, 5, 10]
    concurrency = {}
    for users in levels:
        jobs = [(tokens[i % len(tokens)], path) for i in range(users) for _ in range(loads_per_user) for path in SCREEN]
        t = time.time()
        with ThreadPoolExecutor(max_workers=users * len(SCREEN)) as pool:
            results = list(pool.map(lambda j: _get(base, j[1], j[0]), jobs))
        wall = time.time() - t
        s = _summary(results)
        s["throughput_rps"] = round(len(results) / wall, 1)
        s["screen_load_p95_s"] = round(s["p95_ms"] / 1000, 2)
        concurrency[users] = s
        suite.cases.append(Case(f"{users} users opening the app {loads_per_user}x each", s["errors"] == 0,
                                f"p50 {s['p50_ms']}ms, p95 {s['p95_ms']}ms, {s['errors']} errors, {s['rate_limited']} rate-limited"))
        time.sleep(2)
    suite.metrics["concurrency"] = concurrency

    # 3. rate limit fires for a single user, others unaffected
    burst_token, other = tokens[0], tokens[1]
    time.sleep(61)  # fresh minute window for this user
    burst = [_get(base, "/api/initiatives", burst_token) for _ in range(70)]
    ok, limited = sum(1 for s, _, _ in burst if s == 200), sum(1 for s, _, _ in burst if s == 429)
    other_ok = _get(base, "/api/initiatives", other)[0] == 200
    suite.metrics["rate_limit"] = {"burst_of": 70, "allowed": ok, "rate_limited": limited, "other_user_unaffected": other_ok}
    suite.cases.append(Case("per-user rate limit (60/min per route) kicks in", 55 <= ok <= 61 and limited >= 9,
                            f"{ok} allowed, {limited} got 429"))
    suite.cases.append(Case("one user's burst doesn't block another user", other_ok, ""))

    # 4. Notes screen as notes grow (one load account)
    scale_user = ensure_user(LOAD_USERS[-1] if not quick else LOAD_USERS[n_users - 1])
    scale_token = sign_in(LOAD_USERS[-1] if not quick else LOAD_USERS[n_users - 1])
    scaling = {}
    for n in ([50, 300] if quick else [50, 300, 1000]):
        _seed_notes(scale_user, n)
        runs = [_get(base, "/api/notes", scale_token) for _ in range(5)]
        ms = [m for s, m, _ in runs if s == 200]
        scaling[n] = {"p50_ms": round(statistics.median(ms)) if ms else None,
                      "payload_kb": round(runs[-1][2] / 1024, 1), "errors": sum(1 for s, _, _ in runs if s != 200)}
    wipe_user_data(scale_user)
    suite.metrics["notes_scaling"] = scaling
    worst = scaling[max(scaling)]
    suite.cases.append(Case(f"Notes screen with {max(scaling)} notes loads under 3s",
                            worst["errors"] == 0 and (worst["p50_ms"] or 1e9) < 3000,
                            f"{worst['p50_ms']}ms, {worst['payload_kb']} KB"))

    rss_after = _server_rss_mb(base)
    if rss_after:
        suite.metrics["server_memory_mb"] = {"before": rss_before, "after": rss_after}
        suite.cases.append(Case("server memory stays under Render free 512 MB", rss_after < 450, f"{rss_after} MB"))
    return suite
