"""The admin page's numbers (api/routers/admin.py::_overview) from synthetic
events with known answers - these are what user/capacity decisions rest on,
so the arithmetic is pinned down here."""

from datetime import datetime, timedelta, timezone

import pytest

from api.routers import admin

BIG, SMALL, GUARD = "openai/gpt-oss-120b", "openai/gpt-oss-20b", "openai/gpt-oss-safeguard-20b"


def _ts(minutes_ago=5):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


def _e(kind, name, user="u1", req=None, model=None, tokens=None, status=None, ms=None, error_id=None, detail=None, ago=5):
    d = dict(detail or {})
    if req:
        d["req"] = req
    return {"created_at": _ts(ago), "user_id": user, "kind": kind, "name": name, "status": status, "duration_ms": ms,
            "model": model, "tokens": tokens, "error_id": error_id, "detail": d}


def _capture(req, user="u1", extraction=3400, intent_=600, guard=750):
    return [
        _e("usage", "interactions_logged", user, req),
        _e("llm", "moderation", user, req, GUARD, guard, ms=200),
        _e("llm", "intent", user, req, SMALL, intent_, ms=500),
        _e("llm", "extraction", user, req, BIG, extraction, ms=1500),
        _e("cohere", "embed", user, req, ms=300),
    ]


def _question(req, user="u1"):
    return [
        _e("usage", "ai_questions_asked", user, req),
        _e("llm", "moderation", user, req, GUARD, 750),
        _e("llm", "agent", user, req, SMALL, 1200),
        _e("llm", "agent", user, req, SMALL, 1200),
        _e("llm", "agent", user, req, BIG, 1600),
    ]


@pytest.fixture
def overview(monkeypatch):
    def run(events, snapshot=None, usage=None):
        monkeypatch.setattr(admin, "_events", lambda since: (events, True))
        monkeypatch.setattr(admin.db, "get_all_user_emails", lambda: {"u1": "a@x.com", "u2": "b@x.com"})
        monkeypatch.setattr(admin.db, "get_usage_count", lambda uid, res, period: (usage or {}).get((uid, res), 0))
        monkeypatch.setattr(admin.llm_budget, "snapshot", lambda: snapshot or {})
        return admin._overview(1)
    return run


def test_capacity_is_cost_per_action_against_each_models_remaining_budget(overview):
    o = overview(_capture("r1") + _capture("r2", extraction=3600) + _question("q1"))
    cap = {c["action"]: c for c in o["capacity"]}
    assert cap["capture"]["samples"] == 2
    assert cap["capture"]["avg_tokens"] == {BIG: 3500, SMALL: 600, GUARD: 750}
    left = {b["model"]: b["left"] for b in o["budget"]}
    assert left[BIG] == 200_000 - (3400 + 3600 + 1600)
    # the binding model decides: min over models of left // tokens-per-capture
    expected = min(left[BIG] // 3500, left[SMALL] // 600, left[GUARD] // 750)
    assert cap["capture"]["left_today"] == expected
    assert cap["question"]["avg_tokens"] == {SMALL: 2400, BIG: 1600, GUARD: 750}


def test_every_model_in_use_is_listed_once(overview):
    o = overview(_capture("r1"), snapshot={BIG: {"used_today": 1, "day": "x"}})
    models = [b["model"] for b in o["budget"]]
    assert models[:2] == [BIG, SMALL] and GUARD in models and len(models) == len(set(models))


def test_budget_uses_the_larger_of_logged_and_live_counters(overview):
    today = datetime.now(timezone.utc).date().isoformat()
    o = overview(_capture("r1"), snapshot={BIG: {"used_today": 50_000, "day": today, "blocked_until": 0}})
    assert next(b for b in o["budget"] if b["model"] == BIG)["used"] == 50_000


def test_no_samples_means_no_capacity_guess(overview):
    o = overview([])
    assert all(c["left_today"] is None and c["samples"] == 0 for c in o["capacity"])


def test_per_user_usage_errors_and_limits(overview):
    evs = _capture("r1", "u1") + _capture("r2", "u1") + _question("q1", "u2") + [
        _e("request", "POST /api/chat/stream", "u1", status=200, ms=900),
        _e("request", "GET /api/notes", "u2", status=500, ms=100),
        _e("error", "chat: reading your note", "u2", error_id="ABC123", status=500,
           detail={"type": "ValueError", "message": "bad"}),
        _e("limit", "user_monthly_cap", "u2", detail={"resource": "interactions_logged"}),
        _e("limit", "groq_tokens_per_minute", None, model=BIG),
    ]
    o = overview(evs, usage={("u1", "interactions_logged"): 12})
    users = {u["email"]: u for u in o["users"]}
    assert users["a@x.com"]["captures"] == 2 and users["a@x.com"]["questions"] == 0
    assert users["a@x.com"]["tokens"] == 2 * (3400 + 600 + 750)
    assert users["a@x.com"]["monthly"]["capture"] == {"used": 12, "cap": 50}
    assert users["b@x.com"]["errors"] == 1 and users["b@x.com"]["limits"] == 1
    assert o["users"][0]["email"] == "a@x.com"  # sorted by tokens
    limits = {l["name"]: l for l in o["limits"]}
    assert limits["user_monthly_cap"]["top_users"] == ["b@x.com"] and limits["user_monthly_cap"]["info"]
    assert limits["groq_tokens_per_minute"]["count"] == 1
    assert o["errors"][0]["error_id"] == "ABC123" and o["errors"][0]["user"] == "b@x.com"
    assert o["totals"] == {"requests": 2, "failed_requests": 1, "p95_ms": 900, "active_users": 2}


def test_daily_series_and_range(overview):
    evs = _capture("r1") + [_e("usage", "ai_questions_asked", ago=60 * 30)]  # 30h ago: outside "today" range
    o = overview(evs)
    assert sum(d["captures"] for d in o["daily"]) == 1
    assert sum(d["questions"] for d in o["daily"]) == 0
