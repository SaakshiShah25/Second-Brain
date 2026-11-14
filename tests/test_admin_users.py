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
    # the permanent per-day record: "c" used the app on 3 days long before the 30 days of events we keep
    monkeypatch.setattr(db, "get_activity_days", lambda: [{"user_id": "c", "day": iso(d)[:10]} for d in (58, 55, 50)])
    return accounts


def test_test_accounts_are_recognised(monkeypatch):
    for email in ("load1@myconfia.local", "both@myconfia.local", "x@example.com", "a@b.test"):
        assert admin.is_test_account(email), email
    assert admin.is_test_account("sanketshah3@gmail.com")                    # not a real inbox, hidden by name
    for email in ("me@company.com", "someone@gmail.com", "", None):
        assert not admin.is_test_account(email), email
    monkeypatch.setenv("ADMIN_HIDE_EMAILS", "Someone.Else@Gmail.com, other@x.com")
    assert admin.is_test_account("someone.else@gmail.com") and admin.is_test_account("other@x.com")


def test_the_table_has_only_real_people_with_a_status_and_day_counts(world):
    rows = {r["email"]: r for r in admin._users_table()}
    assert "sanketshah3@gmail.com" not in rows
    assert set(rows) == {"real.active@gmail.com", "real.quiet@gmail.com", "real.gone@gmail.com", "never.came@gmail.com"}
    a = rows["real.active@gmail.com"]
    assert a["status"] == "Active (last 7 days)" and a["days_as_member"] == 21   # joined 20 days ago: the day joined is day 1
    assert a["days_used"] == 3 and a["days_with_a_note"] == 2     # activity on 2 days + a note on one more day (9 days ago)
    assert a["captures_30"] == 1 and a["tokens_30"] == 5000 and a["days_since_last_use"] == 1
    assert rows["real.quiet@gmail.com"]["status"] == "Quiet (8-30 days)" and rows["real.quiet@gmail.com"]["days_used"] == 0
    assert rows["real.gone@gmail.com"]["days_used"] == 3          # 3 recorded days from long ago; the note was saved on one of them
    assert rows["real.gone@gmail.com"]["status"] == "Not using it (30+ days)" and rows["real.gone@gmail.com"]["days_with_a_note"] == 1
    assert rows["never.came@gmail.com"]["status"] == "Never signed in" and rows["never.came@gmail.com"]["last_used"] is None
    assert len(admin._users_table(include_test=True)) == 6


def test_the_excel_file_has_both_sheets_and_the_right_columns(world):
    wb = load_workbook(io.BytesIO(admin.users_workbook(admin._users_table())))
    assert wb.sheetnames == ["All users", "Not using it"]
    header = [c.value for c in wb["All users"][1]]
    assert header[:2] == ["Email", "Status"] and "Days used (all time)" in header and "Days since last use" in header
    assert not any("could have been used" in h or "% of those" in h for h in header)
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


def test_days_are_calendar_days_so_days_used_cannot_look_bigger_than_days_since_joining():
    # joined late on the 1st, now early on the 14th: 12 days and a few hours have passed, but it is 13 calendar days
    now = datetime(2026, 11, 14, 3, 0, tzinfo=timezone.utc)
    assert admin._days_ago("2026-11-01T22:00:00+00:00", now) == 13
    assert admin._days_ago("2026-11-14T00:30:00+00:00", now) == 0
    assert admin._days_ago("2026-11-13T23:59:00+00:00", now) == 1
    assert admin._days_ago(None, now) is None


def test_activity_days_are_written_once_and_survive_a_missing_table(monkeypatch):
    import observability

    saved = []
    monkeypatch.setattr(db, "upsert_activity_days", lambda rows: saved.append(rows))
    monkeypatch.setattr(observability, "_active_seen", set())
    monkeypatch.setattr(observability, "_active_retry_at", 0.0)
    batch = [
        {"user_id": "a", "kind": "request", "created_at": "2026-11-14T08:00:00+00:00"},
        {"user_id": "a", "kind": "llm", "created_at": "2026-11-14T09:00:00+00:00"},       # same person, same day
        {"user_id": "a", "kind": "refused", "created_at": "2026-11-15T09:00:00+00:00"},   # a refused call is not use
        {"user_id": None, "kind": "request", "created_at": "2026-11-14T09:00:00+00:00"},  # the cron job is nobody
    ]
    observability._save_active_days(batch)
    observability._save_active_days(batch)                                               # already saved: nothing more to write
    assert saved == [[{"user_id": "a", "day": "2026-11-14"}]]

    def boom(rows):
        raise RuntimeError("no table")

    monkeypatch.setattr(db, "upsert_activity_days", boom)
    observability._save_active_days([{"user_id": "b", "kind": "request", "created_at": "2026-11-14T08:00:00+00:00"}])   # no crash
    assert observability._active_retry_at > 0


def test_a_person_with_no_stored_data_shows_zero_not_blank_and_sent_notes_are_not_stored_notes(monkeypatch):
    # nine notes were sent and processed, then deleted: logged in the events, nothing stored now
    events = [{"user_id": "a", "kind": "usage", "name": "interactions_logged", "created_at": iso(20), "tokens": None} for _ in range(9)]
    monkeypatch.setattr(db, "get_all_users", lambda: {"a": {"email": "p@gmail.com", "created_at": iso(40), "last_sign_in_at": iso(20)}})
    monkeypatch.setattr(db, "get_app_events", lambda since: events)
    monkeypatch.setattr(db, "get_note_dates", lambda: [])
    monkeypatch.setattr(db, "get_activity_days", lambda: [])
    monkeypatch.setattr(db, "get_storage_by_user", lambda: [{"user_id": "someone-else", "notes": 3, "tasks": 1}])   # the function works, they have no row
    row = admin._users_table()[0]
    assert row["captures_30"] == 9 and row["notes"] == 0 and row["tasks"] == 0 and row["days_with_a_note"] == 0
