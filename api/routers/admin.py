"""
api/routers/admin.py — the admin page's data (frontend/src/pages/AdminPage.tsx)
and the daily report email. Everything is computed from app_event rows
(observability.py) - no paid analytics service.

Who is an admin: the ADMIN_EMAILS list below (hardcoded, not an env var).

  GET  /api/admin/me            {"admin": bool} - shows/hides the Settings link
  GET  /api/admin/overview      AI budget left today and how many more
                                captures/questions that buys, per-user usage
                                (tokens by feature, storage), accounts that
                                aren't using the app, a scaling estimate,
                                where limits are being hit, recent errors
  GET  /api/admin/feedback      ratings (average, how many of each, week by week, common reasons) and
                                reported problems, with a status the admin can change
  PATCH /api/admin/feedback/{id}  mark a report new / seen / fixed
  POST /api/admin/daily-report  cron (X-Cron-Secret): emails yesterday's
                                summary to ALERT_EMAIL and deletes events
                                older than 30 days
"""

import logging
import os
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from statistics import median

from fastapi import APIRouter, Depends, Header, HTTPException

import db
import email_client
import entitlements
import llm_budget
import observability
from api.auth import get_current_user_id, verified_email
from llm_client import FAST_MODEL_NAME, MODEL_NAME

router = APIRouter()

RETENTION_DAYS = 30

# What each limit means and what the user experiences - shown next to the counts.
LIMIT_INFO = {
    "groq_tokens_per_minute": "Groq free tier: 8K tokens/minute per model. Requests in that minute fall back or get a 'busy' message.",
    "groq_tokens_per_day": "Groq free tier: 200K tokens/day per model. Captures/questions fail until it resets.",
    "ai_unavailable": "Users were told the AI is busy / at its limit (nothing saved; their text was put back).",
    "user_monthly_cap": "A user reached their monthly free cap (entitlements.FREE_LIMITS).",
    "api_rate_limit": "Too many requests in a minute from one user (api/rate_limit.py).",
    "cohere_rate_limit": "Cohere trial key: 1,000 calls/month, rerank 10/minute. Search used keyword-only.",
    "cohere_rerank_daily_cap": "Our own daily rerank cap (COHERE_RERANK_DAILY_CAP) - search used hybrid order.",
    "not_invited": "Someone signed in who isn't in ALLOWED_EMAILS.",
}

# usage-event resource -> the action shown on the page
ACTIONS = {"interactions_logged": "capture", "ai_questions_asked": "question"}


log = logging.getLogger(__name__)

ADMIN_EMAILS = ("sanketyou8@gmail.com", "shahsaakshi25@gmail.com")


def _admins() -> list:
    return list(ADMIN_EMAILS)


def _email_of(user_id: str) -> str:
    """The signed-in account's email: the one Supabase verified for this request's token, else a lookup."""
    return verified_email(user_id) or (db.get_user_email(user_id) or "").lower()


def _is_admin(user_id: str) -> bool:
    try:
        email = _email_of(user_id)
    except Exception:
        # Not "not an admin": the Auth lookup itself failed (check SUPABASE_SERVICE_ROLE_KEY on the server).
        log.exception("admin check: couldn't look up the email for user %s", user_id)
        return False
    if email not in _admins():
        log.warning("admin check: %r is not an admin", email)
        return False
    return True


def require_admin(user_id: str = Depends(get_current_user_id)) -> str:
    if not _is_admin(user_id):
        try:
            who = _email_of(user_id)
        except Exception:
            who = None
        # Says which account was checked, so "wrong account" and "email lookup failed" can be told apart.
        raise HTTPException(403, f"Admins only. You're signed in as {who}, which isn't an admin account."
                            if who else "Admins only - and the server couldn't look up which account this is.")
    return user_id


@router.get("/me")
def me(user_id: str = Depends(get_current_user_id)):
    return {"admin": _is_admin(user_id)}


def _events(since: datetime):
    """(events, persisted): stored events, or - until app_event exists -
    the ones this server process has seen since it started."""
    iso = since.isoformat()
    try:
        return db.get_app_events(iso), True
    except Exception:
        return [e for e in observability.recent_events() if e["created_at"] >= iso], False


def _day(ts: str) -> str:
    return ts[:10]


def _overview(days: int) -> dict:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    events, persisted = _events(min(since, now.replace(hour=0, minute=0, second=0, microsecond=0)))
    in_range = [e for e in events if e["created_at"] >= since.isoformat()]
    today = now.date().isoformat()
    try:
        accounts = db.get_all_users()
    except Exception:
        accounts = {}
    emails = {uid: a["email"] for uid, a in accounts.items()}
    label = lambda uid: emails.get(uid, uid or "(system)")
    try:
        storage = {r["user_id"]: {k: v for k, v in r.items() if k != "user_id"} for r in db.get_storage_by_user()}
        storage_ok = True
    except Exception:   # migration 43 not applied yet
        storage, storage_ok = {}, False

    # ---- AI budget today ----
    snap = llm_budget.snapshot()
    budget = []
    # Every model in use has its own daily budget (the safety check runs on a
    # third one) - list them all, the two main ones first.
    models = [MODEL_NAME, FAST_MODEL_NAME]
    models += sorted(({e["model"] for e in events if e["kind"] == "llm" and e["model"]} | set(snap)) - set(models))
    for model in models:
        logged = sum(e["tokens"] or 0 for e in events if e["kind"] == "llm" and e["model"] == model and _day(e["created_at"]) == today)
        state = snap.get(model, {})
        used = max(logged, state.get("used_today", 0) if state.get("day") == today else 0)
        blocked = state.get("blocked_until", 0) > time.time()
        budget.append({
            "model": model, "used": used, "limit": llm_budget.DAILY_TOKEN_LIMIT,
            "left": max(0, llm_budget.DAILY_TOKEN_LIMIT - used), "blocked": blocked,
            "minute_left": state.get("remaining"),
        })
    left = {b["model"]: b["left"] for b in budget}

    # ---- what one capture / question costs, per model (from real requests) ----
    req_action, req_tokens = {}, defaultdict(Counter)
    for e in in_range:
        req = (e.get("detail") or {}).get("req")
        if not req:
            continue
        if e["kind"] == "usage" and e["name"] in ACTIONS:
            req_action[req] = ACTIONS[e["name"]]
        elif e["kind"] == "llm":
            req_tokens[req][e["model"]] += e["tokens"] or 0
    capacity = []
    for action in ("capture", "question"):
        reqs = [req_tokens[r] for r, a in req_action.items() if a == action and req_tokens[r]]
        if not reqs:
            capacity.append({"action": action, "samples": 0, "avg_tokens": {}, "left_today": None})
            continue
        avg = {m: round(sum(r[m] for r in reqs) / len(reqs)) for m in {m for r in reqs for m in r}}
        left_today = min((left.get(m, 0) // t for m, t in avg.items() if t), default=None)
        capacity.append({"action": action, "samples": len(reqs), "avg_tokens": avg, "left_today": left_today})

    # ---- per feature ----
    feats = defaultdict(lambda: {"calls": 0, "tokens": 0, "ms": []})
    for e in in_range:
        if e["kind"] in ("llm", "cohere"):
            f = feats[(e["kind"], e["name"], e["model"] or "cohere")]
            f["calls"] += 1
            f["tokens"] += e["tokens"] or 0
            if e["duration_ms"] is not None:
                f["ms"].append(e["duration_ms"])
    features = sorted(
        ({"kind": k, "feature": n, "model": m, "calls": v["calls"], "tokens": v["tokens"],
          "avg_tokens": round(v["tokens"] / v["calls"]) if v["calls"] else 0,
          "median_ms": round(median(v["ms"])) if v["ms"] else None}
         for (k, n, m), v in feats.items()),
        key=lambda f: -f["tokens"],
    )

    # ---- per user ----
    users = defaultdict(lambda: {"captures": 0, "questions": 0, "tokens": 0, "requests": 0, "errors": 0,
                                 "limits": 0, "last_seen": None, "by_feature": Counter()})
    user_days = set()   # (user, day) pairs with AI use - for the scaling estimate
    model_user_day = defaultdict(int)
    for e in in_range:
        uid = e.get("user_id")
        if not uid:
            continue
        u = users[uid]
        u["last_seen"] = max(u["last_seen"] or "", e["created_at"])
        if e["kind"] == "usage":
            key = {"interactions_logged": "captures", "ai_questions_asked": "questions"}.get(e["name"])
            if key:
                u[key] += 1
        elif e["kind"] == "llm":
            u["tokens"] += e["tokens"] or 0
            u["by_feature"][e["name"]] += e["tokens"] or 0
            user_days.add((uid, _day(e["created_at"])))
            model_user_day[e["model"]] += e["tokens"] or 0
        elif e["kind"] == "request":
            u["requests"] += 1
        elif e["kind"] == "error":
            u["errors"] += 1
        elif e["kind"] == "limit":
            u["limits"] += 1
    period = entitlements._current_period()
    user_rows = []
    for uid, u in users.items():
        monthly = {}
        for resource, action in ACTIONS.items():
            try:
                monthly[action] = {"used": db.get_usage_count(uid, resource, period),
                                   "cap": entitlements.FREE_LIMITS.get(resource)}
            except Exception:
                monthly[action] = None
        user_rows.append({"user_id": uid, "email": label(uid), **u, "monthly": monthly,
                          "by_feature": dict(u["by_feature"].most_common(6)), "storage": storage.get(uid)})
    user_rows.sort(key=lambda r: -r["tokens"])

    # ---- accounts that did nothing in this period ----
    inactive = sorted(
        ({"user_id": uid, "email": a["email"], "joined": a["created_at"][:10] or None,
          "last_sign_in": a["last_sign_in_at"], "storage": storage.get(uid)}
         for uid, a in accounts.items() if uid not in users),
        key=lambda r: r["last_sign_in"] or "",
    )

    # ---- how far the free tier stretches: a model's daily budget / what one active user-day costs ----
    scale = []
    for model, tokens in sorted(model_user_day.items(), key=lambda kv: -kv[1]):
        per_user_day = tokens / max(1, len(user_days))
        scale.append({"model": model, "tokens_per_user_day": round(per_user_day),
                      "users_supported": int(llm_budget.DAILY_TOKEN_LIMIT // per_user_day) if per_user_day else None})

    # ---- limits ----
    lim = defaultdict(lambda: {"count": 0, "last": None, "users": Counter()})
    for e in in_range:
        if e["kind"] == "limit":
            l = lim[e["name"]]
            l["count"] += 1
            l["last"] = e["created_at"]
            if e.get("user_id"):
                l["users"][label(e["user_id"])] += 1
    limits = sorted(
        ({"name": n, "count": v["count"], "last": v["last"], "info": LIMIT_INFO.get(n, ""),
          "top_users": [u for u, _ in v["users"].most_common(3)]} for n, v in lim.items()),
        key=lambda l: -l["count"],
    )

    # ---- errors ----
    errors = [
        {"at": e["created_at"], "where": e["name"], "error_id": e["error_id"], "status": e["status"],
         "type": (e.get("detail") or {}).get("type"), "message": (e.get("detail") or {}).get("message"),
         "user": label(e.get("user_id")) if e.get("user_id") else None}
        for e in reversed(in_range) if e["kind"] == "error"
    ][:50]

    # ---- the problems people run into most: failures, limits and refusals, counted by what and where ----
    seen = defaultdict(lambda: {"count": 0, "users": set(), "last": None, "example": None})
    for e in in_range:
        if e["kind"] not in ("error", "limit", "refused"):
            continue
        d = e.get("detail") or {}
        what = e["name"] if e["kind"] != "error" else f"{e['name']} ({d.get('type') or 'error'})"
        p = seen[(e["kind"], what, e["status"])]
        p["count"] += 1
        p["last"] = e["created_at"]
        p["example"] = d.get("message") or d.get("limit") or p["example"]
        if e.get("user_id"):
            p["users"].add(e["user_id"])
    problems = sorted(
        ({"kind": k, "what": w, "status": st, "count": v["count"], "users": len(v["users"]), "last": v["last"],
          "example": v["example"], "info": LIMIT_INFO.get(w, "") if k == "limit" else ""}
         for (k, w, st), v in seen.items()),
        key=lambda p: -p["count"],
    )[:15]

    # ---- per day ----
    daily = defaultdict(lambda: {"requests": 0, "captures": 0, "questions": 0, "tokens": 0, "errors": 0, "limits": 0})
    for e in in_range:
        d = daily[_day(e["created_at"])]
        if e["kind"] == "request":
            d["requests"] += 1
        elif e["kind"] == "usage" and e["name"] in ACTIONS:
            d["captures" if ACTIONS[e["name"]] == "capture" else "questions"] += 1
        elif e["kind"] == "llm":
            d["tokens"] += e["tokens"] or 0
        elif e["kind"] == "error":
            d["errors"] += 1
        elif e["kind"] == "limit":
            d["limits"] += 1

    requests = [e for e in in_range if e["kind"] == "request"]
    slow = sorted((e["duration_ms"] or 0 for e in requests), reverse=True)
    return {
        "days": days,
        "generated_at": now.isoformat(),
        "persisted": persisted,
        "budget": budget,
        "capacity": capacity,
        "features": features,
        "users": user_rows,
        "inactive": inactive,
        "scale": scale,
        "storage": {"available": storage_ok, **{k: sum(r.get(k) or 0 for r in storage.values()) for k in (
            "notes", "note_bytes", "tasks", "task_bytes", "documents", "document_bytes", "index_chunks", "index_bytes")}},
        "accounts": len(accounts),
        "limits": limits,
        "errors": errors,
        "problems": problems,
        "daily": [{"day": k, **v} for k, v in sorted(daily.items())],
        "totals": {
            "requests": len(requests),
            "failed_requests": sum(1 for e in requests if (e["status"] or 0) >= 500),
            "p95_ms": slow[len(slow) // 20] if slow else None,
            "active_users": len(users),
        },
    }


@router.get("/overview")
def overview(days: int = 7, _: str = Depends(require_admin)):
    return _overview(max(1, min(days, RETENTION_DAYS)))


def _feedback(days: int) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        rows = db.get_feedback(since.isoformat())
    except Exception:   # schema.sql section 47 not applied yet
        return {"available": False, "days": days}
    try:
        emails = {uid: a["email"] for uid, a in db.get_all_users().items()}
    except Exception:
        emails = {}
    ratings = [r for r in rows if r["kind"] == "rating" and r.get("rating")]
    counts = Counter(r["rating"] for r in ratings)
    weeks: dict = defaultdict(list)
    for r in ratings:
        d = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")).date()
        weeks[(d - timedelta(days=d.weekday())).isoformat()].append(r["rating"])
    reasons = Counter(t for r in rows for t in (r.get("tags") or []))
    return {
        "available": True,
        "days": days,
        "ratings": {
            "count": len(ratings),
            "average": round(sum(r["rating"] for r in ratings) / len(ratings), 2) if ratings else None,
            "counts": {str(n): counts.get(n, 0) for n in (1, 2, 3, 4)},
            "weekly": [{"week": w, "count": len(v), "average": round(sum(v) / len(v), 2)} for w, v in sorted(weeks.items())],
        },
        "reasons": [{"tag": t, "count": c} for t, c in reasons.most_common()],
        "open_issues": sum(1 for r in rows if r["kind"] == "issue" and r["status"] == "new"),
        "items": [
            {
                "id": r["id"], "at": r["created_at"], "kind": r["kind"], "rating": r.get("rating"), "tags": r.get("tags") or [],
                "message": r.get("message"), "screen": r.get("screen"), "status": r["status"],
                "user": emails.get(r["user_id"], r["user_id"]), "context": r.get("context") or {},
            }
            for r in rows[:100]
        ],
    }


@router.get("/feedback")
def feedback(days: int = 30, _: str = Depends(require_admin)):
    return _feedback(max(1, min(days, 365)))


@router.patch("/feedback/{feedback_id}")
def set_feedback_status(feedback_id: int, body: dict, _: str = Depends(require_admin)):
    status = (body or {}).get("status")
    if status not in ("new", "seen", "fixed"):
        raise HTTPException(400, "status must be new, seen or fixed")
    db.update_feedback_status(feedback_id, status)
    return {"ok": True}


@router.post("/daily-report")
def daily_report(x_cron_secret: str = Header(None)):
    expected = os.environ.get("CRON_SECRET")
    if not expected or x_cron_secret != expected:
        raise HTTPException(401, "Invalid cron secret")
    o = _overview(1)
    lines = [f"MyConfía - last 24 hours ({o['generated_at'][:16]} UTC)", ""]
    t = o["totals"]
    lines.append(f"Active users: {t['active_users']} · requests: {t['requests']} · failed: {t['failed_requests']}"
                 f" · p95 response: {t['p95_ms'] or '-'} ms")
    lines.append("")
    lines.append("AI budget used today (UTC):")
    for b in o["budget"]:
        lines.append(f"  {b['model']}: {b['used']:,} / {b['limit']:,} tokens")
    for c in o["capacity"]:
        if c["left_today"] is not None:
            lines.append(f"  ≈ {c['left_today']} more {c['action']}s possible today (avg {c['avg_tokens']} tokens each)")
    lines.append("")
    lines.append("Users:")
    for u in o["users"] or []:
        lines.append(f"  {u['email']}: {u['captures']} captures, {u['questions']} questions, {u['tokens']:,} tokens,"
                     f" {u['errors']} errors, {u['limits']} limit hits")
    if not o["users"]:
        lines.append("  (no activity)")
    lines.append("")
    lines.append("Limits hit:" if o["limits"] else "Limits hit: none")
    for l in o["limits"]:
        lines.append(f"  {l['name']} ×{l['count']} - {l['info']}")
    lines.append("")
    lines.append(f"Errors: {len(o['errors'])}")
    for e in o["errors"][:15]:
        lines.append(f"  [{e['error_id']}] {e['at'][11:16]} {e['where']}: {e['type']}: {e['message']}"
                     + (f" (user {e['user']})" if e["user"] else ""))
    if not o["persisted"]:
        lines += ["", "Note: app_event table missing - events are only kept in memory until schema.sql section 35 runs."]

    sent = False
    to = observability.alert_email()
    if to:
        try:
            email_client.send_email(to, "[MyConfía] Daily report", "\n".join(lines))
            sent = True
        except Exception as e:
            observability.error("daily report email", e, alert_admin=False)
    try:
        db.delete_app_events_before((datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)).isoformat())
    except Exception:
        pass
    return {"sent": sent, "to": to}
