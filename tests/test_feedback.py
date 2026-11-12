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

    monkeypatch.setattr(db, "count_feedback_since", count)
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


def test_rating_or_not_now_stops_the_card_for_a_while(store):
    send("snooze")
    assert feedback.prompt("u1") == {"ask": False}
    store.rows.clear()
    send("rating", rating=3)
    assert feedback.prompt("u1") == {"ask": False}


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
    assert set(row["context"]) == {"app_version", "included"}


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
