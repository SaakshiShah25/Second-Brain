"""
api/routers/agenda.py - What is on the calendar: follow-ups by their deadline day
(with the time of day when there is one) and the yearly dates people have
(birthdays, anniversaries) that fall in a range. Read-only.

  GET /api/agenda?start=YYYY-MM-DD&end=YYYY-MM-DD   - one month (or any range up to ~3 months)
  GET /api/agenda/upcoming?days=30                  - the next birthdays/anniversaries, for "Coming up"
"""

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

import db
import graph
from api.auth import get_current_user_id

router = APIRouter()

MAX_RANGE_DAYS = 100


def _slim(task: dict) -> dict:
    person = task.get("person") or (task.get("interaction") or {}).get("person") or None
    due_time = task.get("due_time")
    return {
        "id": task["id"], "description": task["description"], "due_date": task.get("due_date"),
        "due_time": str(due_time)[:5] if due_time else None, "status": task.get("status"), "owner": task.get("owner"),
        "person": {"id": person["id"], "name": person["name"]} if person else None,
        "initiative": ((task.get("interaction") or {}).get("initiative") or {}).get("name"),
    }


def _events(user_id: str, start: date, end: date) -> list:
    try:
        return graph.key_date_occurrences(user_id, start, end)
    except Exception as e:  # the key_date table is created by schema.sql section 31
        print(f"[warn] agenda: key dates unavailable ({e})")
        return []


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
    return {"start": start, "end": end, "tasks": tasks, "events": _events(user_id, first, last)}


@router.get("/upcoming")
def upcoming(days: int = 30, user_id: str = Depends(get_current_user_id)):
    days = max(1, min(days, 120))
    today = date.today()
    events = _events(user_id, today, today + timedelta(days=days))
    for e in events:
        e["days_until"] = (date.fromisoformat(e["date"]) - today).days
    return {"events": events}
