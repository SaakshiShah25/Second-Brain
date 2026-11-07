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
