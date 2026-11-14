"""The admin page leaves out test accounts, and the Excel export lists the real ones with their usage."""
import io
from datetime import datetime, timedelta, timezone

import pytest
from openpyxl import load_workbook

import db
from api.routers import admin

NOW = datetime.now(timezone.utc)
iso = lambda days: (NOW - timedelta(days=days)).isoformat()


@pytest.fixture
def world(monkeypatch):
    accounts = {
        "a": {"email": "real.active@gmail.com", "created_at": iso(20), "last_sign_in_at": iso(1)},
        "b": {"email": "real.quiet@gmail.com", "created_at": iso(40), "last_sign_in_at": iso(15)},
        "c": {"email": "real.gone@gmail.com", "created_at": iso(60), "last_sign_in_at": iso(45)},
        "d": {"email": "never.came@gmail.com", "created_at": iso(5), "last_sign_in_at": None},
        "t1": {"email": "load1@myconfia.local", "created_at": iso(30), "last_sign_in_at": iso(30)},
        "t2": {"email": "someone@example.com", "created_at": iso(30), "last_sign_in_at": iso(30)},
    }
    events = [
        {"user_id": "a", "kind": "request", "name": "POST /api/chat", "created_at": iso(1), "tokens": None},
        {"user_id": "a", "kind": "request", "name": "GET /api/tasks", "created_at": iso(3), "tokens": None},
        {"user_id": "a", "kind": "usage", "name": "interactions_logged", "created_at": iso(3), "tokens": None},
        {"user_id": "a", "kind": "llm", "name": "extraction", "created_at": iso(3), "tokens": 5000},
        {"user_id": "t1", "kind": "request", "name": "GET /x", "created_at": iso(1), "tokens": None},
        {"user_id": "b", "kind": "refused", "name": "GET /y", "created_at": iso(0), "tokens": None},   # not real use
    ]
    notes = [{"user_id": "a", "created_at": iso(3)}, {"user_id": "a", "created_at": iso(9)}, {"user_id": "c", "created_at": iso(50)}]
    monkeypatch.setattr(db, "get_all_users", lambda: accounts)
    monkeypatch.setattr(db, "get_app_events", lambda since: events)
    monkeypatch.setattr(db, "get_note_dates", lambda: notes)
    monkeypatch.setattr(db, "get_storage_by_user", lambda: [])
    return accounts


def test_test_accounts_are_recognised(monkeypatch):
    for email in ("load1@myconfia.local", "both@myconfia.local", "x@example.com", "a@b.test"):
        assert admin.is_test_account(email), email
    for email in ("sanketshah3@gmail.com", "me@company.com", "", None):
        assert not admin.is_test_account(email), email
    monkeypatch.setenv("ADMIN_HIDE_EMAILS", "Someone.Else@Gmail.com, other@x.com")
    assert admin.is_test_account("someone.else@gmail.com") and admin.is_test_account("other@x.com")


def test_the_table_has_only_real_people_with_a_status_and_day_counts(world):
    rows = {r["email"]: r for r in admin._users_table()}
    assert set(rows) == {"real.active@gmail.com", "real.quiet@gmail.com", "real.gone@gmail.com", "never.came@gmail.com"}
    a = rows["real.active@gmail.com"]
    assert a["status"] == "Active (last 7 days)" and a["days_since_joined"] == 20
    assert a["days_used_30"] == 2 and a["days_with_a_note"] == 2          # two distinct days of activity / of notes
    assert a["captures_30"] == 1 and a["tokens_30"] == 5000 and a["days_since_last_use"] == 1
    assert rows["real.quiet@gmail.com"]["status"] == "Quiet (8-30 days)" and rows["real.quiet@gmail.com"]["days_used_30"] == 0
    assert rows["real.gone@gmail.com"]["status"] == "Not using it (30+ days)" and rows["real.gone@gmail.com"]["days_with_a_note"] == 1
    assert rows["never.came@gmail.com"]["status"] == "Never signed in" and rows["never.came@gmail.com"]["last_used"] is None
    assert len(admin._users_table(include_test=True)) == 6


def test_the_excel_file_has_both_sheets_and_the_right_columns(world):
    wb = load_workbook(io.BytesIO(admin.users_workbook(admin._users_table())))
    assert wb.sheetnames == ["All users", "Not using it"]
    header = [c.value for c in wb["All users"][1]]
    assert header[:2] == ["Email", "Status"] and "Days used (last 30 days)" in header and "Days since last use" in header
    assert wb["All users"].max_row == 5                      # header + 4 real people
    not_using = [r[0].value for r in wb["Not using it"].iter_rows(min_row=2)]
    assert sorted(not_using) == ["never.came@gmail.com", "real.gone@gmail.com"]


def test_the_backup_ai_card_counts_notes_that_went_through_nvidia(monkeypatch):
    nowiso = NOW.isoformat()
    events = [
        {"user_id": "a", "kind": "llm", "name": "extraction", "model": "nvidia/nemotron-3-ultra-550b-a55b", "tokens": 5300, "created_at": nowiso, "detail": {"fallback": True}},
        {"user_id": "a", "kind": "llm", "name": "extraction", "model": "nvidia/nemotron-3-ultra-550b-a55b", "tokens": 5200, "created_at": nowiso, "detail": {"fallback": True}},
        {"user_id": "a", "kind": "llm", "name": "extraction", "model": "openai/gpt-oss-120b", "tokens": 5700, "created_at": nowiso, "detail": {}},
        {"user_id": "a", "kind": "limit", "name": "groq_tokens_per_minute", "created_at": nowiso, "detail": {"feature": "extraction"}},
        {"user_id": "a", "kind": "limit", "name": "groq_tokens_per_minute", "created_at": nowiso, "detail": {"feature": "intent"}},
        {"user_id": "a", "kind": "limit", "name": "nvidia_fallback_failed", "model": "nvidia/nemotron-3-ultra-550b-a55b", "created_at": nowiso, "detail": {"message": "timed out"}},
        *[{"user_id": "a", "kind": "usage", "name": "interactions_logged", "created_at": nowiso, "detail": {}} for _ in range(4)],
    ]
    blank = {"status": None, "duration_ms": None, "model": None, "tokens": None, "error_id": None}   # real events always have these
    events = [{**blank, **e} for e in events]
    monkeypatch.setattr(db, "get_all_users", lambda: {"a": {"email": "real@gmail.com", "created_at": iso(5), "last_sign_in_at": iso(0)}})
    monkeypatch.setattr(db, "get_app_events", lambda since: events)
    monkeypatch.setattr(db, "get_storage_by_user", lambda: [])
    monkeypatch.setenv("NVIDIA_API_KEY", "x")
    out = admin._overview(1)
    fb = out["fallback"]
    assert fb["enabled"] and fb["notes"] == 2 and fb["failed"] == 1 and fb["logged"] == 4
    assert fb["groq_refused"] == 1                      # only the extraction refusal, not the intent one
    assert fb["tokens"] == 10500 and fb["models"] == [{"model": "nvidia/nemotron-3-ultra-550b-a55b", "notes": 2}]
    assert fb["last_failure"] == "timed out"
    # the NVIDIA model is not listed against Groq's daily budget
    assert not any(b["model"].startswith("nvidia/") for b in out["budget"])
