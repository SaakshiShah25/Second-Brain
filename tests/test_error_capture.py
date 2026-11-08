"""Every failure a person can be shown is counted for the admin page."""

from fastapi.testclient import TestClient

import db
import observability
from api.auth import get_current_user_id
from api.main import app
from api.routers import admin


def _events(monkeypatch):
    seen = []
    monkeypatch.setattr(observability, "record", lambda kind, name, **kw: seen.append((kind, name, kw)))
    return seen


def test_a_refused_request_is_counted_with_its_reason(monkeypatch):
    seen = _events(monkeypatch)
    app.dependency_overrides[get_current_user_id] = lambda: "u1"
    monkeypatch.setattr(db, "get_initiative", lambda u, i: None)
    r = TestClient(app).post("/api/notes", json={"raw_text": "hi", "initiative_id": 99})
    app.dependency_overrides.clear()
    assert r.status_code == 404
    kind, name, kw = next(e for e in seen if e[0] == "refused")
    assert name == "POST /api/notes" and kw["status"] == 404 and "no longer exists" in kw["detail"]["message"]


def test_an_invalid_request_is_counted(monkeypatch):
    seen = _events(monkeypatch)
    app.dependency_overrides[get_current_user_id] = lambda: "u1"
    r = TestClient(app).post("/api/notes", json={"initiative_id": 1})
    app.dependency_overrides.clear()
    assert r.status_code == 422
    assert any(e[0] == "refused" and e[2]["status"] == 422 for e in seen)


def test_the_admin_refusal_names_the_account_it_checked(monkeypatch):
    app.dependency_overrides[get_current_user_id] = lambda: "u1"
    monkeypatch.setattr(db, "get_user_email", lambda uid: "someone@example.com")
    r = TestClient(app).get("/api/admin/me")           # /me answers, it doesn't refuse
    assert r.json() == {"admin": False}
    r = TestClient(app).get("/api/admin/overview")
    assert r.status_code == 403 and "someone@example.com" in r.json()["detail"]
    monkeypatch.setattr(db, "get_user_email", lambda uid: (_ for _ in ()).throw(RuntimeError("auth down")))
    r = TestClient(app).get("/api/admin/overview")
    assert r.status_code == 403 and "couldn't look up" in r.json()["detail"]
    app.dependency_overrides.clear()


def test_the_most_common_problems_are_ranked(monkeypatch):
    events = [
        {"created_at": "2999-01-01T00:00:00+00:00", "user_id": "a", "kind": "refused", "name": "POST /api/tasks", "status": 400,
         "duration_ms": None, "model": None, "tokens": None, "error_id": None, "detail": {"message": "An item needs some wording."}},
    ] * 3 + [
        {"created_at": "2999-01-01T00:00:00+00:00", "user_id": "b", "kind": "limit", "name": "api_rate_limit", "status": 429,
         "duration_ms": None, "model": None, "tokens": None, "error_id": None, "detail": {}},
    ]
    monkeypatch.setattr(admin, "_events", lambda since: (events, True))
    monkeypatch.setattr(db, "get_all_users", lambda: {})
    monkeypatch.setattr(db, "get_storage_by_user", lambda: [])
    out = admin._overview(7)
    assert [(p["kind"], p["what"], p["count"]) for p in out["problems"]] == [
        ("refused", "POST /api/tasks", 3), ("limit", "api_rate_limit", 1)]
    assert out["problems"][0]["example"] == "An item needs some wording."
