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

from datetime import date
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