"""
api/routers/tasks.py — REST equivalent of views/digest_view.py's task
section. Same filter semantics (Overdue/Due soon/Open/Done/All), just
wrapped as endpoints instead of Streamlit widgets. The "relationships
gone quiet" half of the Digest page lives in people.py instead, since it
belongs with the other /api/people/* routes.
"""

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

import date_utils
import db
import search_index
import google_calendar
from api.auth import get_current_user_id
from api.schemas import ScheduleCalendarRequest, TaskStatusUpdate

router = APIRouter()

FILTERS = {"overdue", "due_soon", "open", "done", "all"}


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


@router.patch("/{task_id}")
def update_task(task_id: int, body: TaskStatusUpdate, user_id: str = Depends(get_current_user_id)):
    if body.status is not None:
        if body.status not in ("open", "done"):
            raise HTTPException(400, "status must be 'open' or 'done'")
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
    if changes.get("due_time") and not (changes.get("due_date") or db.get_task(user_id, task_id).get("due_date")):
        raise HTTPException(400, "Give the task a date before giving it a time.")
    if changes.get("due_date") is None and "due_date" in changes:
        changes["due_time"] = None  # no date -> no time of day either
    if changes:
        try:
            db.update_task_fields(user_id, task_id, **changes)
        except Exception as e:
            if "due_time" in changes and "due_time" in str(e):
                raise HTTPException(503, "Task times aren't available yet - run schema.sql section 32 first.")
            raise
    search_index.enqueue(user_id, "task", [task_id])
    return {"ok": True}


@router.post("/{task_id}/calendar")
def add_task_to_calendar(
    task_id: int, body: Optional[ScheduleCalendarRequest] = None, user_id: str = Depends(get_current_user_id)
):
    task = db.get_task(user_id, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    event_date = body.event_date if body else None
    if not event_date and not task.get("due_date"):
        raise HTTPException(400, "This task has no due date - nothing to put on a calendar.")

    try:
        result = google_calendar.create_event(user_id, task, event_date=event_date)
    except google_calendar.NotConnectedError:
        raise HTTPException(409, "Google Calendar isn't connected yet.")
    except Exception as e:
        raise HTTPException(502, f"Couldn't create the calendar event: {e}")

    db.set_task_calendar_event(user_id, task_id, result["calendar_event_id"])
    return result


@router.delete("/{task_id}/calendar")
def remove_task_from_calendar(task_id: int, user_id: str = Depends(get_current_user_id)):
    task = db.get_task(user_id, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    event_id = task.get("calendar_event_id")
    if event_id:
        try:
            google_calendar.delete_event(user_id, event_id)
        except google_calendar.NotConnectedError:
            pass  # already disconnected - nothing to clean up on Google's side
    db.set_task_calendar_event(user_id, task_id, None)
    return {"ok": True}
