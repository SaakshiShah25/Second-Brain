"""The API as the app sees it (FastAPI TestClient, every external service
stubbed): readable errors with reference codes, CORS headers even on
crashes, "AI busy" handling, chat-stream failures that say where they
happened, rate limits, admin-only routes, data export, the daily report."""

import base64
import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from groq import RateLimitError
from postgrest.exceptions import APIError

import db
import llm_budget
import moderation
from api import main
from api.auth import get_current_user_id
from api.rate_limit import reset_limits
from api.routers import admin, chat, settings
from conftest import events

ORIGIN = "https://app.example.com"  # FRONTEND_URL in conftest


def _auth(sub="user-1"):
    body = base64.urlsafe_b64encode(json.dumps({"sub": sub}).encode()).decode().rstrip("=")
    return {"Authorization": f"Bearer h.{body}.s", "Origin": ORIGIN}


@pytest.fixture
def client(obs, monkeypatch):
    reset_limits()
    main.app.dependency_overrides[get_current_user_id] = lambda: "user-1"
    monkeypatch.setattr(db, "get_user_email", lambda uid: f"{uid}@example.com")
    with TestClient(main.app, raise_server_exceptions=False) as c:
        yield c
    main.app.dependency_overrides.clear()


def _route(path, fn):
    main.app.router.routes = [r for r in main.app.router.routes if getattr(r, "path", None) != path]
    main.app.add_api_route(path, fn, methods=["GET"])


def test_unhandled_crash_is_readable_has_reference_and_cors(client, obs):
    def crash():
        raise ZeroDivisionError("division by zero")

    _route("/api/notes/crash-test", crash)
    r = client.get("/api/notes/crash-test", headers=_auth())
    assert r.status_code == 500
    body = r.json()
    assert "your notes" in body["detail"] and body["error_id"] in body["detail"]
    assert r.headers.get("access-control-allow-origin") == ORIGIN  # browser sees the message, not "Failed to fetch"
    (err,) = events("error")
    assert err["error_id"] == body["error_id"] and err["user_id"] == "user-1"
    assert len(obs.sent) == 1


def test_http_500_detail_is_replaced_with_where_and_reference(client):
    def fail():
        raise HTTPException(500, "Extraction failed: Error code: 400 {'raw': 'internal'}")

    _route("/api/capture/fail-test", fail)
    r = client.get("/api/capture/fail-test", headers=_auth())
    assert r.status_code == 500
    assert "saving your note" in r.json()["detail"] and "internal" not in r.json()["detail"]
    assert "Extraction failed" in events("error")[0]["detail"]["message"]  # kept for the admin


def test_ai_busy_is_a_limit_not_an_error(client, obs):
    def busy():
        raise HTTPException(429, llm_budget.BUSY_MESSAGE)

    _route("/api/chat/busy-test", busy)
    r = client.get("/api/chat/busy-test", headers=_auth())
    assert r.status_code == 429 and r.json()["detail"] == llm_budget.BUSY_MESSAGE
    assert events("limit", "ai_unavailable") and not events("error") and obs.sent == []


def test_ordinary_4xx_pass_through_untouched(client):
    def not_found():
        raise HTTPException(404, "No such note.")

    _route("/api/notes/missing-test", not_found)
    r = client.get("/api/notes/missing-test", headers=_auth())
    assert r.status_code == 404 and r.json() == {"detail": "No such note."}
    assert not events("error")


def test_missing_database_table_explains_itself(client):
    def missing():
        raise APIError({"message": "Could not find the table", "code": "PGRST205", "hint": None, "details": None})

    _route("/api/initiatives/missing-table-test", missing)
    r = client.get("/api/initiatives/missing-table-test", headers=_auth())
    assert r.status_code == 503
    assert "database update" in r.json()["detail"] and r.json()["error_id"]


def test_every_api_request_is_recorded_with_route_user_and_timing(client):
    _route("/api/notes/ok-test", lambda: {"ok": True})
    client.get("/api/notes/ok-test", headers=_auth("user-7"))
    (req,) = [e for e in events("request") if e["name"] == "GET /api/notes/ok-test"]
    assert req["status"] == 200 and req["user_id"] == "user-7" and req["duration_ms"] is not None


def test_health_is_503_when_database_is_down(client, monkeypatch):
    def down():
        raise RuntimeError("connection refused")

    monkeypatch.setattr(db, "get_client", down)
    r = client.get("/api/health")
    assert r.status_code == 503 and r.json()["supabase"] is False


def test_client_crash_reports_are_recorded_and_alerted(client, obs):
    r = client.post("/api/client-error", headers=_auth(),
                    json={"message": "TypeError: x is undefined", "stack": "at Notes", "path": "/notes"})
    assert r.status_code == 204
    (err,) = events("error")
    assert err["name"] == "app screen /notes" and err["detail"]["source"] == "frontend"
    assert len(obs.sent) == 1


# ---------- chat stream: failures say where they happened ----------

def _stream(client, text="what is open?"):
    r = client.post("/api/chat/stream", headers=_auth(), json={"text": text, "history": []})
    out = []
    for block in r.text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        out.append((lines.get("event"), json.loads(lines.get("data", "null"))))
    return out


@pytest.fixture
def safe_ask(monkeypatch):
    monkeypatch.setattr(moderation, "check", lambda text: {"safe": True})
    monkeypatch.setattr(chat.intent, "classify", lambda text: "ask")


def test_stream_crash_names_the_step_and_gives_reference(client, safe_ask, monkeypatch):
    def broken(*a, **k):
        raise KeyError("sources")

    monkeypatch.setattr(chat, "_answer_question", broken)
    events_ = _stream(client)
    assert [e for e, _ in events_][:3] == ["stage", "stage", "stage"]
    kind, data = events_[-1]
    assert kind == "error" and data["status_code"] == 500
    assert "looking through your notes" in data["detail"] and data["error_id"] in data["detail"]
    assert "back in the box" in data["detail"]


def test_stream_groq_limit_becomes_busy_message(client, safe_ask, monkeypatch):
    import httpx

    def limited(*a, **k):
        req = httpx.Request("POST", "https://api.groq.com")
        raise RateLimitError("tpd", response=httpx.Response(429, request=req), body=None)

    monkeypatch.setattr(chat, "_answer_question", limited)
    kind, data = _stream(client)[-1]
    assert kind == "error" and data["status_code"] == 429 and data["detail"] == llm_budget.BUSY_MESSAGE
    assert events("limit", "ai_unavailable") and not events("error")


def test_stream_moderation_unavailable_is_a_blocked_reply(client, monkeypatch):
    monkeypatch.setattr(moderation, "check", lambda text: {"safe": False, "unavailable": True})
    kind, data = _stream(client)[-1]
    assert kind == "result" and data["intent"] == "blocked" and data["reason"] == "unavailable"


def test_chat_rate_limit_is_per_user_and_friendly(client, monkeypatch):
    monkeypatch.setattr(moderation, "check", lambda text: {"safe": False, "category": "x", "rationale": ""})
    codes = [client.post("/api/chat/stream", headers=_auth("busy-user"), json={"text": "hi", "history": []}).status_code
             for _ in range(21)]
    assert codes[:20] == [200] * 20 and codes[20] == 429
    r = client.post("/api/chat/stream", headers=_auth("busy-user"), json={"text": "hi", "history": []})
    assert "faster than the app allows" in r.json()["detail"]
    assert events("limit", "api_rate_limit")[0]["user_id"] == "busy-user"
    # someone else is unaffected
    assert client.post("/api/chat/stream", headers=_auth("calm-user"), json={"text": "hi", "history": []}).status_code == 200


# ---------- data export ----------

def test_export_downloads_everything_without_internal_fields(client, monkeypatch):
    monkeypatch.setattr(settings.db, "get_initiatives", lambda uid: [{"id": 1, "name": "IC", "user_id": uid}])
    monkeypatch.setattr(settings.db, "get_all_interactions_with_context",
                        lambda uid: [{"id": 5, "summary": "- point", "embedding": [0.1], "user_id": uid}])
    monkeypatch.setattr(settings.db, "get_all_tasks_with_context",
                        lambda uid: [{"id": 9, "description": "do it", "interaction": {"id": 5}, "user_id": uid}])
    monkeypatch.setattr(settings.db, "get_user_preference", lambda uid: {"theme": "light", "user_id": uid})
    r = client.get("/api/settings/export", headers=_auth())
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    data = r.json()
    assert data["email"] == "user-1@example.com"
    assert data["notes"] == [{"id": 5, "summary": "- point"}]  # no embedding, no user_id
    assert data["tasks"] == [{"id": 9, "description": "do it"}]
    assert data["settings"] == {"theme": "light"}


# ---------- admin ----------

def test_admin_routes_are_admin_only(client, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "boss@example.com")
    assert client.get("/api/admin/me", headers=_auth()).json() == {"admin": False}
    assert client.get("/api/admin/overview", headers=_auth()).status_code == 403
    monkeypatch.setattr(db, "get_user_email", lambda uid: "boss@example.com")
    monkeypatch.setattr(admin, "_overview", lambda days: {"days": days})
    assert client.get("/api/admin/me", headers=_auth()).json() == {"admin": True}
    assert client.get("/api/admin/overview?days=90", headers=_auth()).json() == {"days": 30}  # clamped


def test_admin_falls_back_to_alert_email(client, monkeypatch):
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)
    monkeypatch.setenv("ALERT_EMAIL", "alerts@example.com")
    monkeypatch.setattr(db, "get_user_email", lambda uid: "Alerts@Example.com")
    assert client.get("/api/admin/me", headers=_auth()).json() == {"admin": True}


def test_daily_report_needs_the_cron_secret_and_emails_a_summary(client, obs, monkeypatch):
    assert client.post("/api/admin/daily-report", headers={"X-Cron-Secret": "wrong"}).status_code == 401
    monkeypatch.setattr(admin, "_events", lambda since: ([], True))
    monkeypatch.setattr(admin.db, "get_all_user_emails", lambda: {})
    deleted = []
    monkeypatch.setattr(admin.db, "delete_app_events_before", lambda iso: deleted.append(iso))
    r = client.post("/api/admin/daily-report", headers={"X-Cron-Secret": "test-cron"})
    assert r.status_code == 200 and r.json()["sent"] is True
    (to, subject, body) = obs.sent[-1]
    assert subject == "[MyConfía] Daily report"
    for section in ("AI budget used today", "Users:", "Limits hit", "Errors: 0"):
        assert section in body
    assert deleted  # retention ran


def test_default_limit_applies_to_every_ordinary_route(client, monkeypatch):
    """Regression: slowapi's middleware couldn't see FastAPI's included
    routers, so no ordinary route was limited at all (found by the load eval)."""
    from api.routers import initiatives, notes

    monkeypatch.setattr(initiatives.db, "get_initiatives", lambda uid: [])
    monkeypatch.setattr(notes.db, "get_all_interactions_with_context", lambda uid: [])
    codes = [client.get("/api/initiatives", headers=_auth("burst")).status_code for _ in range(61)]
    assert codes[:60] == [200] * 60 and codes[60] == 429
    assert client.get("/api/initiatives", headers=_auth("burst")).json()["detail"].startswith("You're sending requests")
    assert client.get("/api/notes", headers=_auth("burst")).status_code == 200  # counted per route
    assert client.get("/api/initiatives", headers=_auth("someone-else")).status_code == 200  # and per user
    (lim,) = events("limit", "api_rate_limit")[:1]
    assert lim["user_id"] == "burst" and lim["detail"]["route"] == "GET /api/initiatives"
