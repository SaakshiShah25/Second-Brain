"""
important_dates.py - Recurring personal occasions (birthdays, anniversaries)
stored on a person's profile, and the date math to find which are coming up.

A note like "Aditi's birthday is on March 14" or "their anniversary is next
Friday" carries a date that matters every YEAR, not once - so it's stored on
the person as a month/day (plus an optional year, e.g. a birth year), not as
an ordinary dated note that would scroll away into the timeline.

Division of labor, same as everywhere else in this app: the LLM only reads
the note and names what it found ("Birthday", month 3, day 14 - or, for a
relative phrase like "tomorrow", the phrase itself); the real calendar
arithmetic - resolving "next Friday", validating that Feb 30 isn't a date,
working out how many days away the next occurrence is - happens here.

Shape of one stored entry (person.important_dates is a list of these):
    {"label": "Birthday", "month": 3, "day": 14, "year": 1990 or None}
"""

from datetime import date
from typing import Optional

import date_utils

MAX_DATES_PER_PERSON = 20
_MAX_LABEL = 60


def _valid_month_day(month, day) -> bool:
    if not isinstance(month, int) or not isinstance(day, int) or isinstance(month, bool) or isinstance(day, bool):
        return False
    try:
        date(2000, month, day)  # 2000 is a leap year, so Feb 29 is legal
        return True
    except ValueError:
        return False


def clean_one(raw, reference_date: Optional[date] = None) -> Optional[dict]:
    """Validates ONE entry as the extraction model returned it (or as the
    edit form submitted it) into the stored shape, or None if it doesn't
    describe a real recurring date. A relative `when` ("tomorrow") is
    resolved against `reference_date` - the date the note was about, not
    necessarily today - and only its month/day is kept: "tomorrow is her
    birthday" means her birthday falls on that calendar date every year."""
    if not isinstance(raw, dict):
        return None
    label = " ".join(str(raw.get("label") or "").split())[:_MAX_LABEL]
    if not label:
        return None

    month, day = raw.get("month"), raw.get("day")
    if not _valid_month_day(month, day):
        resolved = date_utils.resolve_relative_phrase(raw.get("when"), reference_date)
        if not resolved:
            return None
        resolved_date = date.fromisoformat(resolved)
        month, day = resolved_date.month, resolved_date.day

    year = raw.get("year")
    if isinstance(year, bool) or not isinstance(year, int) or not 1900 <= year <= 2100:
        year = None
    return {"label": label, "month": month, "day": day, "year": year}


def clean_many(raw_list, reference_date: Optional[date] = None) -> list:
    out = []
    for raw in raw_list or []:
        cleaned = clean_one(raw, reference_date)
        if cleaned:
            out.append(cleaned)
    return out


def merge(existing: list, new: list) -> list:
    """Adds `new` entries to `existing`, skipping any that are already
    there (same label, ignoring case, on the same month/day) - the same
    birthday mentioned in a second note shouldn't be listed twice. If it's
    the same occasion but the new entry adds a year the old one lacked, the
    year is filled in rather than ignored."""
    merged = [dict(e) for e in (existing or [])]
    for entry in new or []:
        match = next(
            (m for m in merged
             if m.get("label", "").lower() == entry["label"].lower()
             and m.get("month") == entry["month"] and m.get("day") == entry["day"]),
            None,
        )
        if match:
            if not match.get("year") and entry.get("year"):
                match["year"] = entry["year"]
        elif len(merged) < MAX_DATES_PER_PERSON:
            merged.append(dict(entry))
    return merged


def next_occurrence(month: int, day: int, today: Optional[date] = None) -> date:
    """The next date (today included) this month/day falls on. Feb 29 in a
    non-leap year is observed on Feb 28."""
    today = today or date.today()

    def in_year(year: int) -> date:
        try:
            return date(year, month, day)
        except ValueError:  # Feb 29 in a non-leap year
            return date(year, 2, 28)

    this_year = in_year(today.year)
    return this_year if this_year >= today else in_year(today.year + 1)


def days_until(entry: dict, today: Optional[date] = None) -> int:
    today = today or date.today()
    return (next_occurrence(entry["month"], entry["day"], today) - today).days


def upcoming(people: list, within_days: int = 30, today: Optional[date] = None) -> list:
    """Every stored date across `people` whose next occurrence is within
    `within_days`, soonest first. Each result carries enough for a UI or a
    brief to render on its own: who, what, when, how far away, and (for a
    birthday with a known birth year) the age they're turning."""
    today = today or date.today()
    results = []
    for person in people:
        for entry in person.get("important_dates") or []:
            if not _valid_month_day(entry.get("month"), entry.get("day")):
                continue
            n = days_until(entry, today)
            if n > within_days:
                continue
            occurrence = next_occurrence(entry["month"], entry["day"], today)
            turning = None
            if entry.get("year") and entry.get("label", "").lower() == "birthday":
                turning = occurrence.year - entry["year"]
            results.append({
                "person_id": person["id"],
                "person_name": person["name"],
                "label": entry["label"],
                "month": entry["month"],
                "day": entry["day"],
                "date": occurrence.isoformat(),
                "days_until": n,
                "turning": turning,
            })
    results.sort(key=lambda r: (r["days_until"], r["person_name"].lower()))
    return results


def describe_when(n: int) -> str:
    return "today" if n == 0 else "tomorrow" if n == 1 else f"in {n} days"
