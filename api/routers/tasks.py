"""
api/routers/tasks.py — Items: every to-do and list entry (the Today, Lists and
Tasks pages all read GET /api/tasks), adding one straight into a list, editing
one (status, owner, wording, deadline, priority, reminder, category, repeat, list,
detail) and deleting one. Ticking off a repeating item moves it to its next date
instead of closing it.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

import date_utils
import db
import search_index
from api.auth import get_current_user_id
from api.schemas import TaskCreate, TaskStatusUpdate

router = APIRouter()

FILTERS = {"overdue", "due_soon", "open", "done", "all"}
PRIORITIES = {"high", "normal", "low"}


def _matches_filter(task: dict, filter_name: str, today_str: str, soon_cutoff_str: str) -> bool:
    due = task.get("due_date")
    status = task.get("status")
    if filter_name == "overdue":
        return status == "open" and bool(due) and due < today_str
    if filter_name == "due_soon":
        return status == "open" and bool(due) and today_str <= due <= soon_cutoff_str
    if filter_name == "open":
        return status == "open"
    if filter_name == "done":
        return status == "done"
    return True  # "all"


@router.get("")
def list_tasks(status_filter: str = "open", user_id: str = Depends(get_current_user_id)):
    if status_filter not in FILTERS:
        raise HTTPException(400, f"status_filter must be one of {sorted(FILTERS)}")
    all_tasks = db.get_all_tasks_with_context(user_id)
    today_str = date.today().isoformat()
    soon_cutoff_str = (date.today() + timedelta(days=7)).isoformat()

    tasks = [t for t in all_tasks if _matches_filter(t, status_filter, today_str, soon_cutoff_str)]
    counts = {
        "overdue": sum(1 for t in all_tasks if _matches_filter(t, "overdue", today_str, soon_cutoff_str)),
        "due_soon": sum(1 for t in all_tasks if _matches_filter(t, "due_soon", today_str, soon_cutoff_str)),
        "open": sum(1 for t in all_tasks if t["status"] == "open"),
        "done": sum(1 for t in all_tasks if t["status"] == "done"),
    }
    return {"tasks": tasks, "counts": counts}


def _valid_repeat(value):
    if not value:
        return None
    repeat = date_utils.normalize_repeat(value)
    if not repeat:
        raise HTTPException(400, "repeat must be daily, weekdays, weekly, monthly, yearly or hours:N")
    return repeat


def _check_list(user_id: str, list_id):
    if list_id is not None and not db.get_list(user_id, list_id):
        raise HTTPException(404, "That list doesn't exist.")


@router.post("")
def create_task(body: TaskCreate, user_id: str = Depends(get_current_user_id)):
    text = " ".join(body.description.split())
    if not text:
        raise HTTPException(400, "An item needs some wording.")
    _check_list(user_id, body.list_id)
    if body.initiative_id is not None and not db.get_initiative(user_id, body.initiative_id):
        raise HTTPException(400, "That space doesn't exist.")
    if body.due_date and not date_utils.to_valid_date(body.due_date):
        raise HTTPException(400, "due_date must be YYYY-MM-DD")
    repeat = _valid_repeat(body.repeat)
    due_time = date_utils.to_valid_time(body.due_time) if body.due_time else None
    due_date = body.due_date or (date.today().isoformat() if (due_time or repeat) else None)
    task_id = db.create_task(user_id, None, text, due_date=due_date, due_time=due_time,
                             list_id=body.list_id, repeat=repeat, initiative_id=body.initiative_id)
    search_index.enqueue(user_id, "task", [task_id])
    return {"id": task_id}


@router.delete("/{task_id}")
def delete_task(task_id: int, user_id: str = Depends(get_current_user_id)):
    db.delete_task(user_id, task_id)
    search_index.enqueue(user_id, "task", [], prune_after=True)
    return {"ok": True}


@router.patch("/{task_id}")
def update_task(task_id: int, body: TaskStatusUpdate, user_id: str = Depends(get_current_user_id)):
    if body.status is not None:
        if body.status not in ("open", "done"):
            raise HTTPException(400, "status must be 'open' or 'done'")
        current = db.get_task(user_id, task_id) if body.status == "done" else None
        if current and current.get("repeat"):
            # A repeating item is never "done": ticking it off moves it to its next date.
            db.update_task_fields(user_id, task_id, due_date=date_utils.next_occurrence(
                current.get("due_date"), current["repeat"]))
        else:
            db.update_task_status(user_id, task_id, body.status)
    if body.owner is not None:
        if body.owner not in ("me", "them"):
            raise HTTPException(400, "owner must be 'me' or 'them'")
        db.update_task_owner(user_id, task_id, body.owner)
    edits = body.model_dump(exclude_unset=True)
    changes = {}
    if "description" in edits:
        text = " ".join((edits["description"] or "").split())
        if not text:
            raise HTTPException(400, "A task needs some wording.")
        changes["description"] = text
    if "due_date" in edits:
        if edits["due_date"] and not date_utils.to_valid_date(edits["due_date"]):
            raise HTTPException(400, "due_date must be YYYY-MM-DD")
        changes["due_date"] = edits["due_date"] or None
    if "due_time" in edits:
        valid = date_utils.to_valid_time(edits["due_time"]) if edits["due_time"] else None
        if edits["due_time"] and not valid:
            raise HTTPException(400, "due_time must look like 19:00 or 7pm")
        changes["due_time"] = valid
    # Options set by the user: priority, a reminder date, and the task's own category.
    needs_migration = False
    if "priority" in edits:
        if edits["priority"] not in PRIORITIES:
            raise HTTPException(400, f"priority must be one of {sorted(PRIORITIES)}")
        changes["priority"] = edits["priority"]
        needs_migration = True
    if "remind_on" in edits:
        if edits["remind_on"] and not date_utils.to_valid_date(edits["remind_on"]):
            raise HTTPException(400, "remind_on must be YYYY-MM-DD")
        # a day that is already over everywhere can't be reminded (one day of slack covers every time zone)
        if edits["remind_on"] and edits["remind_on"] < (date.today() - timedelta(days=1)).isoformat():
            raise HTTPException(400, "That day has already passed - pick today or later.")
        changes["remind_on"] = edits["remind_on"] or None
        changes["reminded_on"] = None  # a new reminder date means it has not been sent yet
        if not changes["remind_on"]:
            edits.setdefault("remind_time", None)  # no reminder, no time for it
        needs_migration = True
    if "remind_time" in edits:
        valid = date_utils.to_valid_time(edits["remind_time"]) if edits["remind_time"] else None
        if edits["remind_time"] and not valid:
            raise HTTPException(400, "remind_time must look like 19:00 or 7pm")
        if valid or db.reminder_time_supported():  # clearing it needs the column too, but only if it was ever set
            changes["remind_time"] = valid
            changes["reminded_on"] = None
        if valid and not db.reminder_time_supported():
            raise HTTPException(503, "Choosing a time for a reminder isn't available yet - run scripts/migration_41_reminder_time.sql first.")
    if "initiative_id" in edits:
        if edits["initiative_id"] is not None and not db.get_initiative(user_id, edits["initiative_id"]):
            raise HTTPException(400, "That space doesn't exist.")
        changes["initiative_id"] = edits["initiative_id"]
        needs_migration = True
    if "list_id" in edits:
        _check_list(user_id, edits["list_id"])
        changes["list_id"] = edits["list_id"]
    if "repeat" in edits:
        changes["repeat"] = _valid_repeat(edits["repeat"])
        if changes["repeat"] and not (changes.get("due_date") or db.get_task(user_id, task_id).get("due_date")):
            changes["due_date"] = date.today().isoformat()  # a routine starts today unless told otherwise
    if "detail" in edits:
        changes["detail"] = " ".join((edits["detail"] or "").split()) or None
    if needs_migration and not db.task_extras_supported():
        raise HTTPException(503, "Priority, reminders and moving tasks aren't available yet - run scripts/migration_38_task_options.sql first.")
    if changes.get("due_time") and not (changes.get("due_date") or db.get_task(user_id, task_id).get("due_date")):
        raise HTTPException(400, "Give the task a date before giving it a time.")
    if changes.get("due_date") is None and "due_date" in changes:
        changes["due_time"] = None  # no date -> no time of day either
        changes["repeat"] = None    # ...and nothing to repeat from
    if changes:
        try:
            db.update_task_fields(user_id, task_id, **changes)
        except Exception as e:
            if "due_time" in changes and "due_time" in str(e):
                raise HTTPException(503, "Task times aren't available yet - run schema.sql section 32 first.")
            raise
    search_index.enqueue(user_id, "task", [task_id])
    return {"ok": True}
