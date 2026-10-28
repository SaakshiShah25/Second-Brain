"""
api/routers/agenda.py - What is on the calendar: tasks by their deadline day
(with the time of day when there is one). Read-only.

  GET /api/agenda?start=YYYY-MM-DD&end=YYYY-MM-DD   - one month (or any range up to ~3 months)
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException

import db
from api.auth import get_current_user_id

router = APIRouter()

MAX_RANGE_DAYS = 100


def _slim(task: dict) -> dict:
    due_time = task.get("due_time")
    return {
        "id": task["id"], "description": task["description"], "due_date": task.get("due_date"),
        "due_time": str(due_time)[:5] if due_time else None, "status": task.get("status"), "owner": task.get("owner"),
        "initiative": ((task.get("interaction") or {}).get("initiative") or {}).get("name"),
    }


@router.get("")
def agenda(start: str, end: str, user_id: str = Depends(get_current_user_id)):
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError:
        raise HTTPException(400, "start and end must be YYYY-MM-DD")
    if last < first or (last - first).days > MAX_RANGE_DAYS:
        raise HTTPException(400, f"Ask for at most {MAX_RANGE_DAYS} days at a time, start before end.")
    tasks = [_slim(t) for t in db.get_all_tasks_with_context(user_id)
             if t.get("due_date") and start <= t["due_date"] <= end]
    # timed ones in clock order, untimed after
    tasks.sort(key=lambda t: (t["due_date"], t["due_time"] is None, t["due_time"] or "", t["id"]))
    return {"start": start, "end": end, "tasks": tasks}
