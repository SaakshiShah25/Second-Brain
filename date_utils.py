"""
date_utils.py — Small shared helper to keep malformed dates from ever
reaching Postgres.

The `date` columns in schema.sql require a full YYYY-MM-DD value. The
extraction/query-parsing LLM calls occasionally return a partial date
instead (e.g. "2026-09" for "sometime in September", when there's no
specific day mentioned) - Postgres rejects that outright with a hard
"invalid input syntax for type date" error. Rather than letting one bad
LLM output crash an entire capture or query, every date string coming
out of the LLM is validated here before use; invalid ones become None
(and the caller decides on a sensible fallback) instead of failing the
whole operation.
"""

import re
from datetime import date, timedelta
from typing import Optional


def to_valid_date(value) -> Optional[str]:
    """Returns `value` unchanged if it's a valid full YYYY-MM-DD date
    string, else None."""
    if not value or not isinstance(value, str):
        return None
    try:
        date.fromisoformat(value)
        return value
    except ValueError:
        return None


_WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}
_RELATIVE_WEEKDAY_RE = re.compile(r"^(next|last|this)\s+(\w+)$")
_IN_DAYS_RE = re.compile(r"^in\s+(\d+)\s+days?$")
_IN_WEEKS_RE = re.compile(r"^in\s+(\d+)\s+weeks?$")


def resolve_relative_phrase(phrase, reference_date: date = None) -> Optional[str]:
    """
    Resolves a date phrase - either an already-absolute ISO date, or one
    of a well-defined set of relative expressions (weekday names
    optionally qualified with next/last/this, today/tomorrow/yesterday,
    "in N days/weeks", "next week") - against `reference_date` (defaults
    to today). Returns an ISO date string, or None if the phrase isn't
    one of these recognized forms.

    This exists because extraction.py used to ask the LLM to compute the
    resulting calendar date itself (e.g. "next Monday" -> figure out
    which date that is) - LLMs are unreliable at exact calendar
    arithmetic. extraction.py now only normalizes the phrase; this
    function does the actual math with real date/timedelta arithmetic,
    which is exact.

    Key convention (deliberate, not incidental): "next <weekday>" always
    means a STRICTLY FUTURE date - if today already IS that weekday, it
    jumps a full 7 days rather than resolving to today (this is exactly
    the bug that motivated this function: "next Monday" said on a Monday
    should never mean today). "last <weekday>" is the mirror - always
    strictly in the past. A bare "<weekday>" with no qualifier resolves
    to the nearest upcoming occurrence (today counts, if today is that
    weekday).
    """
    if reference_date is None:
        reference_date = date.today()

    already_absolute = to_valid_date(phrase)
    if already_absolute:
        return already_absolute

    if not phrase or not isinstance(phrase, str):
        return None

    p = phrase.strip().lower()

    if p == "today":
        return reference_date.isoformat()
    if p == "tomorrow":
        return (reference_date + timedelta(days=1)).isoformat()
    if p == "yesterday":
        return (reference_date - timedelta(days=1)).isoformat()
    if p == "next week":
        return (reference_date + timedelta(weeks=1)).isoformat()

    m = _RELATIVE_WEEKDAY_RE.match(p)
    if m:
        relation, day_name = m.group(1), m.group(2)
        target = _WEEKDAYS.get(day_name)
        if target is not None:
            today_idx = reference_date.weekday()
            if relation == "next":
                delta = (target - today_idx) % 7
                delta = delta or 7  # today itself doesn't count as "next"
                return (reference_date + timedelta(days=delta)).isoformat()
            if relation == "last":
                delta = (today_idx - target) % 7
                delta = delta or 7  # today itself doesn't count as "last"
                return (reference_date - timedelta(days=delta)).isoformat()
            if relation == "this":
                delta = (target - today_idx) % 7  # nearest occurrence, today counts
                return (reference_date + timedelta(days=delta)).isoformat()

    if p in _WEEKDAYS:
        delta = (_WEEKDAYS[p] - reference_date.weekday()) % 7
        return (reference_date + timedelta(days=delta)).isoformat()

    m = _IN_DAYS_RE.match(p)
    if m:
        return (reference_date + timedelta(days=int(m.group(1)))).isoformat()

    m = _IN_WEEKS_RE.match(p)
    if m:
        return (reference_date + timedelta(weeks=int(m.group(1)))).isoformat()

    return None