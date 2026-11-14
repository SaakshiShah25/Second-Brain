"""Feedback: when the rating card is asked, what is accepted, and the admin summary."""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import db
from api.routers import admin, feedback


@pytest.fixture
def store(monkeypatch):
    s = SimpleNamespace(notes=10, rows=[], alerts=[])
    monkeypatch.setattr(db, "count_interactions", lambda uid: s.notes)

    def count(uid, since, kinds):
        return sum(1 for r in s.rows if r["user_id"] == uid and r["kind"] in kinds and r["created_at"] >= since)

    def insert(row):
        row = {"id": len(s.rows) + 1, "created_at": datetime.now(timezone.utc).isoformat(), "status": "new", **row}
        s.rows.append(row)
        return row

    def last(uid, kinds):
        rows = [r for r in s.rows if r["user_id"] == uid and r["kind"] in kinds]
        return rows[-1] if rows else None

    monkeypatch.setattr(db, "count_feedback_since", count)
    monkeypatch.setattr(db, "get_last_feedback", last)
    monkeypatch.setattr(db, "insert_feedback", insert)
    monkeypatch.setattr(db, "get_feedback", lambda since: [r for r in reversed(s.rows) if r["kind"] != "snooze"])
    monkeypatch.setattr(db, "get_all_users", lambda: {"u1": {"email": "a@x.com"}})
    monkeypatch.setattr(db, "get_user_email", lambda uid: "a@x.com")
    monkeypatch.setattr(feedback.observability, "alert", lambda key, subject, body: s.alerts.append(subject))
    return s


def send(kind, **kw):
    body = feedback.FeedbackIn(kind=kind, **kw)
    # the rate-limit decorator needs a real request; call the undecorated function
    return feedback.send.__wrapped__(None, body, "u1")


def test_not_asked_until_a_few_notes_are_saved(store):
    store.notes = 2
    assert feedback.prompt("u1") == {"ask": False}
    store.notes = 5
    assert feedback.prompt("u1") == {"ask": True}


def test_not_now_asks_again_after_five_more_notes_not_thirty_days(store):
    store.notes = 6
    send("snooze")
    store.notes = 10
    assert feedback.prompt("u1") == {"ask": False}       # 4 more notes
    store.notes = 11
    assert feedback.prompt("u1") == {"ask": True}        # 5 more notes


def test_after_a_rating_the_next_ask_is_25_notes_and_30_days_later(store):
    store.notes = 6
    send("rating", rating=3)
    store.notes = 40
    assert feedback.prompt("u1") == {"ask": False}       # plenty of notes, but only just rated
    store.rows[-1]["created_at"] = "2026-01-01T00:00:00+00:00"   # a month and more ago
    assert feedback.prompt("u1") == {"ask": True}
    store.notes = 20
    assert feedback.prompt("u1") == {"ask": False}       # old enough, but only 14 notes since


def test_choosing_something_else_needs_a_few_words(store):
    with pytest.raises(HTTPException):
        send("rating", rating=2, tags=["other"])
    send("rating", rating=2, tags=["other"], message="The reminder never rang")


def test_a_rating_needs_a_score_and_a_problem_needs_words(store):
    with pytest.raises(HTTPException):
        send("rating")
    with pytest.raises(HTTPException):
        send("issue", message="  ")
    with pytest.raises(HTTPException):
        send("nonsense")


def test_unknown_reasons_are_dropped_and_context_is_trimmed(store):
    send("issue", message="It lost my note", tags=["broke", "<script>"], context={"app_version": "1.2", "secret": "x", "included": "a reply"})
    row = store.rows[0]
    assert row["tags"] == ["broke"]
    assert set(row["context"]) == {"app_version", "included", "notes_at"}


def test_only_poor_ratings_and_problems_email_the_admin(store):
    send("rating", rating=4)
    send("rating", rating=3)
    assert store.alerts == []
    send("rating", rating=1, tags=["slow"])
    send("issue", message="broken", tags=["broke"])
    assert len(store.alerts) == 2


def test_daily_cap(store):
    for _ in range(feedback.DAILY_CAP):
        send("rating", rating=3)
    with pytest.raises(HTTPException) as e:
        send("rating", rating=3)
    assert e.value.status_code == 429


def test_admin_summary(store):
    for n in (4, 4, 3, 1):
        send("rating", rating=n, tags=["slow"] if n == 1 else [])
    send("issue", message="x", tags=["broke"])
    out = admin._feedback(30)
    assert out["ratings"]["count"] == 4 and out["ratings"]["average"] == 3.0
    assert out["ratings"]["counts"] == {"1": 1, "2": 0, "3": 1, "4": 2}
    assert out["open_issues"] == 1
    assert {r["tag"] for r in out["reasons"]} == {"slow", "broke"}
    assert out["items"][0]["user"] == "a@x.com"


def test_admin_summary_before_the_table_exists(monkeypatch):
    def boom(since):
        raise RuntimeError("no table")

    monkeypatch.setattr(db, "get_feedback", boom)
    assert admin._feedback(30) == {"available": False, "days": 30}


def test_a_good_rating_can_say_what_went_well_and_something_else_needs_words(store):
    send("rating", rating=4, tags=["quick_to_log", "helpful_answers", "nonsense"])
    assert store.rows[-1]["tags"] == ["quick_to_log", "helpful_answers"]
    with pytest.raises(HTTPException):
        send("rating", rating=3, tags=["other_good"])
    send("rating", rating=3, tags=["other_good"], message="The voice notes")
    assert store.alerts == []                       # good ratings never email the admin
