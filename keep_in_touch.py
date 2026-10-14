"""
keep_in_touch.py - when is it time to catch up with someone?

A contact can have a "keep in touch" frequency (every 7 / 14 / 30 / ... days).
They are DUE once that long has passed since the last note about them, or
since a snooze ran out, whichever is later. This is the one place that rule
lives on the server (the morning brief uses it); frontend/src/lib/keepInTouch.ts
is the same rule for the screens - keep the two in step.
"""

from datetime import date, datetime, timedelta
from typing import Optional

# The choices offered in the app (days). Anything else is rejected.
FREQUENCIES = (7, 14, 30, 60, 90, 180, 365)


def _parse(d: Optional[str]) -> Optional[date]:
    if not d:
        return None
    try:
        return datetime.fromisoformat(str(d)[:10]).date()
    except ValueError:
        return None


def due_date(person: dict) -> Optional[date]:
    """The day a catch-up falls due, or None when no frequency is set. With no
    note and no first-met date there is nothing to count from, so it is due
    now (today)."""
    days = person.get("keep_in_touch_days")
    if not days:
        return None
    last = _parse(person.get("last_interaction_date")) or _parse(person.get("first_met_date"))
    due = last + timedelta(days=days) if last else date.today()
    snoozed = _parse(person.get("keep_in_touch_snoozed_until"))
    return max(due, snoozed) if snoozed else due


def days_overdue(person: dict, today: Optional[date] = None) -> Optional[int]:
    """How many days past due (positive), 0 if due today, negative if still to
    come; None when no frequency is set."""
    due = due_date(person)
    if due is None:
        return None
    return ((today or date.today()) - due).days


def overdue_people(people: list, today: Optional[date] = None) -> list:
    """People due today or earlier, most overdue first, each with `days_overdue`."""
    out = []
    for p in people:
        n = days_overdue(p, today)
        if n is not None and n >= 0:
            out.append({**p, "days_overdue": n})
    out.sort(key=lambda p: -p["days_overdue"])
    return out
