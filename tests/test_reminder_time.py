"""Choosing a time for a task's reminder (PATCH /api/tasks/{id} with remind_on + remind_time)."""
import types
from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from api.routers import tasks as tasks_router
from api.schemas import TaskStatusUpdate

TOMORROW = (date.today() + timedelta(days=1)).isoformat()


def _wire(monkeypatch, supported=True):
    calls = []
    monkeypatch.setattr(tasks_router, "db", types.SimpleNamespace(
        task_extras_supported=lambda: True,
        reminder_time_supported=lambda: supported,
        get_task=lambda uid, tid: {"id": tid, "due_date": None},
        update_task_fields=lambda uid, tid, **f: calls.append(f),
    ))
    monkeypatch.setattr(tasks_router.search_index, "enqueue", lambda *a, **k: None)
    return calls


def _patch(**fields):
    return tasks_router.update_task(4, TaskStatusUpdate(**fields), user_id="u")


def test_a_reminder_can_be_given_a_time_and_is_marked_unsent(monkeypatch):
    calls = _wire(monkeypatch)
    _patch(remind_on=TOMORROW, remind_time="3pm")
    assert calls == [{"remind_on": TOMORROW, "reminded_on": None, "remind_time": "15:00"}]


def test_removing_the_reminder_removes_its_time(monkeypatch):
    calls = _wire(monkeypatch)
    _patch(remind_on=None)
    assert calls == [{"remind_on": None, "reminded_on": None, "remind_time": None}]


def test_a_bad_time_is_refused(monkeypatch):
    _wire(monkeypatch)
    with pytest.raises(HTTPException) as e:
        _patch(remind_on=TOMORROW, remind_time="soonish")
    assert e.value.status_code == 400


def test_choosing_a_time_before_the_migration_says_to_run_it(monkeypatch):
    calls = _wire(monkeypatch, supported=False)
    with pytest.raises(HTTPException) as e:
        _patch(remind_on=TOMORROW, remind_time="15:00")
    assert e.value.status_code == 503 and "migration_41" in e.value.detail and calls == []
    _patch(remind_on=TOMORROW)   # a plain date (9 AM) still works without it
    assert calls == [{"remind_on": TOMORROW, "reminded_on": None}]


# ---- a reminder always comes before the due date ----

IN_3_DAYS = (date.today() + timedelta(days=3)).isoformat()


def _wire_due(monkeypatch, due_date, due_time=None, remind_on=None, remind_time=None):
    calls = _wire(monkeypatch)
    task = {"due_date": due_date, "due_time": due_time, "remind_on": remind_on, "remind_time": remind_time}
    tasks_router.db.get_task = lambda uid, tid: {"id": tid, **task}
    return calls


def test_a_reminder_after_the_due_date_is_refused(monkeypatch):
    _wire_due(monkeypatch, due_date=TOMORROW)
    with pytest.raises(HTTPException) as e:
        _patch(remind_on=IN_3_DAYS)
    assert e.value.status_code == 400 and "before the due date" in e.value.detail


def test_a_reminder_on_the_due_day_has_to_be_before_the_due_time(monkeypatch):
    calls = _wire_due(monkeypatch, due_date=TOMORROW, due_time="16:00")
    _patch(remind_on=TOMORROW, remind_time="15:30")        # earlier the same day: fine
    assert calls[-1]["remind_time"] == "15:30"
    with pytest.raises(HTTPException) as e:
        _patch(remind_on=TOMORROW, remind_time="16:00")    # at the due time itself: too late
    assert e.value.status_code == 400 and "before the due time" in e.value.detail


def test_moving_the_due_date_earlier_than_an_existing_reminder_is_refused(monkeypatch):
    _wire_due(monkeypatch, due_date=IN_3_DAYS, remind_on=IN_3_DAYS)
    with pytest.raises(HTTPException) as e:
        _patch(due_date=TOMORROW)
    assert e.value.status_code == 400
    # ...unless the reminder is cleared in the same change, which is what the app does
    calls = _wire_due(monkeypatch, due_date=IN_3_DAYS, remind_on=IN_3_DAYS)
    _patch(due_date=TOMORROW, remind_on=None)
    assert calls and calls[-1]["due_date"] == TOMORROW and calls[-1]["remind_on"] is None
