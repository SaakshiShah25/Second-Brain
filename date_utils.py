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
    p = re.sub(r"^(?:by|before|till|until)\s+", "", p)

    if p in ("eod", "end of day", "end of the day", "cob", "close of business", "close of play", "tonight", "this evening"):
        return reference_date.isoformat()  # "by EOD" is due today
    if p in ("eow", "end of week", "end of the week"):
        return (reference_date + timedelta(days=max(0, 4 - reference_date.weekday()))).isoformat()
    if p in ("eom", "end of month", "end of the month"):
        return (_add_months(reference_date.replace(day=1), 1) - timedelta(days=1)).isoformat()

    if p == "today":
        return reference_date.isoformat()
    if p == "tomorrow":
        return (reference_date + timedelta(days=1)).isoformat()
    if p == "yesterday":
        return (reference_date - timedelta(days=1)).isoformat()
    if p == "next week":
        return (reference_date + timedelta(weeks=1)).isoformat()
    if p in ("this week", "end of the week", "end of week"):
        # the Friday that closes this week - or today, once the weekend has started
        return (reference_date + timedelta(days=max(0, 4 - reference_date.weekday()))).isoformat()

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


_TIME_24 = re.compile(r"^\s*([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*$")
_TIME_12 = re.compile(r"^\s*(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])\.?m\.?\s*$", re.I)


def to_valid_time(value) -> Optional[str]:
    """'19:00', '7pm', '7:30 PM', '19:30:00' -> 'HH:MM' (24-hour), else None.
    Anything that is not clearly a clock time (e.g. 'evening', 'EOD') is dropped,
    never guessed, so a deadline only ever carries a time the note really stated."""
    if not value or not isinstance(value, str):
        return None
    text = value.strip().lower()
    if text in ("noon", "midday"):
        return "12:00"
    if text == "midnight":
        return "00:00"
    m = _TIME_24.match(text)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"
    m = _TIME_12.match(text)
    if m:
        hour, minute = int(m.group(1)) % 12, int(m.group(2) or 0)
        if m.group(3).lower() == "p":
            hour += 12
        return f"{hour:02d}:{minute:02d}"
    return None


# ---------- Repeating items (schema.sql section 40) ----------
#
# Stored values: daily | weekdays | weekly | monthly | yearly | hours:N. A repeating item has
# ONE due date - the next occurrence. Ticking it off moves that date on instead of closing it.

_REPEAT_WORDS = {
    "daily": "daily", "every day": "daily", "everyday": "daily", "each day": "daily",
    "every night": "daily", "every morning": "daily", "every evening": "daily", "nightly": "daily",
    "weekdays": "weekdays", "every weekday": "weekdays", "on weekdays": "weekdays",
    "weekly": "weekly", "every week": "weekly",
    "monthly": "monthly", "every month": "monthly",
    "yearly": "yearly", "every year": "yearly", "annually": "yearly", "annual": "yearly",
}
_EVERY_N_HOURS = re.compile(r"^(?:hours:|every\s+)(\d{1,2})(?:\s*(?:hours?|hrs?|h))?$")
_EVERY_HOUR = re.compile(r"^(?:hourly|every\s+hour)$")


def normalize_repeat(value) -> Optional[str]:
    """The model's (or the app's) wording -> a stored repeat value, else None.
    'every 2 hours' -> 'hours:2'; anything not clearly a repeat is dropped, never guessed."""
    if not value or not isinstance(value, str):
        return None
    text = " ".join(value.strip().lower().split())
    if text in _REPEAT_WORDS:
        return _REPEAT_WORDS[text]
    if _EVERY_HOUR.match(text):
        return "hours:1"
    m = _EVERY_N_HOURS.match(text)
    if m and 1 <= int(m.group(1)) <= 12:
        return f"hours:{int(m.group(1))}"
    return None


def repeat_hours(repeat) -> Optional[int]:
    """N for an 'hours:N' repeat, else None."""
    if isinstance(repeat, str) and repeat.startswith("hours:") and repeat[6:].isdigit():
        return int(repeat[6:])
    return None


def _add_months_keep_day(d: date, months: int, day: int) -> date:
    """`months` after d, on `day` - or that month's last day when it is shorter (31 Jan -> 28 Feb)."""
    first = _add_months(d, months)
    next_first = _add_months(first, 1)
    return first.replace(day=min(day, (next_first - timedelta(days=1)).day))


def _step(d: date, repeat: str, anchor_day: int, anchor_month: int) -> date:
    if repeat == "weekly":
        return d + timedelta(weeks=1)
    if repeat == "monthly":
        return _add_months_keep_day(d, 1, anchor_day)
    if repeat == "yearly":
        return _add_months_keep_day(date(d.year + 1, anchor_month, 1), 0, anchor_day)
    if repeat == "weekdays":
        d += timedelta(days=1)
        while d.weekday() >= 5:
            d += timedelta(days=1)
        return d
    return d + timedelta(days=1)  # daily, hours:N (an hourly nudge is "done for today")


def first_occurrence(due_date, repeat, today: date = None) -> Optional[str]:
    """The first occurrence on or after today for a NEW repeating item - "Mom's birthday,
    14 March" said in November is next March, not this past one. Non-repeating: unchanged."""
    today = today or date.today()
    if not due_date or not repeat:
        return due_date
    d = date.fromisoformat(due_date)
    day, month = d.day, d.month
    while d < today:
        d = _step(d, repeat, day, month)
    if repeat == "weekdays":
        while d.weekday() >= 5:
            d += timedelta(days=1)
    return d.isoformat()


def next_occurrence(due_date, repeat, today: date = None) -> str:
    """Where a repeating item moves when it is ticked off: the first occurrence after both its
    current date and today. Ticking an overdue daily item lands on tomorrow, not on a day that
    has already gone by; ticking a weekly one early moves it a week on."""
    today = today or date.today()
    d = date.fromisoformat(due_date) if due_date else today
    day, month = d.day, d.month
    d = _step(d, repeat, day, month)
    while d <= today:
        d = _step(d, repeat, day, month)
    return d.isoformat()
