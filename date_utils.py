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
_RELATIVE_MONTH_RE = re.compile(r"^(next|last|this)\s+month$")


def _add_months(d: date, months: int) -> date:
    """Adds/subtracts whole calendar months, landing on the 1st of the
    resulting month - real month arithmetic (handles year rollover and
    varying month lengths), not a 30-day timedelta approximation which
    would drift. Always the 1st: "next month" said on any day of this
    month unambiguously means the month itself, not a specific day
    within it, so the 1st is the one reasonable anchor - same "pick a
    single specific day" convention extraction.py already uses for any
    vague timeframe."""
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


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

    m = _RELATIVE_MONTH_RE.match(p)
    if m:
        relation = m.group(1)
        delta = {"next": 1, "last": -1, "this": 0}[relation]
        return _add_months(reference_date, delta).isoformat()

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

# ---------- Date RANGES (for question scoping: "last week", "in July") ----------

MONTH_NAMES = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
}
_ROLLING_RE = re.compile(r"^(?:last|past|previous)\s+(\d+)\s+(day|week|month)s?$")
_MONTH_YEAR_RE = re.compile(r"^([a-z]+)(?:\s+(\d{4}))?$")
_YEAR_RE = re.compile(r"^(\d{4})$")
_QUARTER_RE = re.compile(r"^(this|last)\s+quarter$")
_FILLER_PREFIXES = ("in the month of ", "the month of ", "during ", "in ", "over ", "throughout ")


def _month_end(d: date) -> date:
    return _add_months(d, 1) - timedelta(days=1)


def _fmt(start: date, end: date) -> tuple:
    return (start.isoformat(), end.isoformat())


def resolve_date_range(phrase, reference_date: date = None) -> Optional[tuple]:
    """Resolves a NORMALIZED time-window phrase into an inclusive
    (start_iso, end_iso) pair of real calendar dates - the range
    counterpart of resolve_relative_phrase(). retrieval.py's query parser
    only ever outputs a phrase from the fixed set below ("last week",
    "july", "last 10 days", ...), never a date it calculated itself - the
    actual arithmetic happens here, exactly, for the same reason
    resolve_relative_phrase exists (LLMs are unreliable at calendar math).

    Conventions, deliberate rather than incidental:
      - "this/last week" are calendar weeks (Monday-Sunday), not a
        rolling 7 days; "last N days/weeks/months" ARE rolling windows
        ending today.
      - A bare month name ("july") means its MOST RECENT occurrence that
        isn't in the future - notes are about the past, so "in December"
        asked in October means last December. An explicit year wins.
      - "last N <unit>" starts N units ago and runs through today (one
        slightly generous day at the front rather than risk silently
        dropping a note from the boundary day).
    Returns None for anything unrecognized, so the caller falls back to
    its normal no-date-filter behavior instead of guessing."""
    if not phrase or not isinstance(phrase, str):
        return None
    ref = reference_date or date.today()
    p = phrase.strip().lower()
    for prefix in _FILLER_PREFIXES:
        if p.startswith(prefix):
            p = p[len(prefix):]
            break
    if p.startswith("the "):
        p = p[4:]

    if p == "today":
        return _fmt(ref, ref)
    if p == "yesterday":
        y = ref - timedelta(days=1)
        return _fmt(y, y)
    if p == "this week":
        start = ref - timedelta(days=ref.weekday())
        return _fmt(start, start + timedelta(days=6))
    if p == "last week":
        start = ref - timedelta(days=ref.weekday() + 7)
        return _fmt(start, start + timedelta(days=6))
    if p == "this month":
        first = ref.replace(day=1)
        return _fmt(first, _month_end(first))
    if p == "last month":
        first = _add_months(ref, -1)
        return _fmt(first, _month_end(first))
    if p == "this year":
        return _fmt(date(ref.year, 1, 1), date(ref.year, 12, 31))
    if p == "last year":
        return _fmt(date(ref.year - 1, 1, 1), date(ref.year - 1, 12, 31))

    m = _QUARTER_RE.match(p)
    if m:
        q_start_month = ((ref.month - 1) // 3) * 3 + 1
        first = date(ref.year, q_start_month, 1)
        if m.group(1) == "last":
            first = _add_months(first, -3)
        return _fmt(first, _month_end(_add_months(first, 2)))

    m = _ROLLING_RE.match(p)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        if n <= 0:
            return None
        if unit == "day":
            return _fmt(ref - timedelta(days=n), ref)
        if unit == "week":
            return _fmt(ref - timedelta(weeks=n), ref)
        back = _add_months(ref, -n)
        start = back.replace(day=min(ref.day, _month_end(back).day))
        return _fmt(start, ref)

    m = _YEAR_RE.match(p)
    if m:
        year = int(m.group(1))
        if 1900 <= year <= 2100:
            return _fmt(date(year, 1, 1), date(year, 12, 31))
        return None

    m = _MONTH_YEAR_RE.match(p)
    if m and m.group(1) in MONTH_NAMES:
        month = MONTH_NAMES[m.group(1)]
        if m.group(2):
            year = int(m.group(2))
        else:
            year = ref.year if month <= ref.month else ref.year - 1
        first = date(year, month, 1)
        return _fmt(first, _month_end(first))

    return None
