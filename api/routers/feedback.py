"""
api/routers/feedback.py — "How is MyConfía working for you?" ratings and "Report a problem".

  GET  /api/feedback/prompt   {"ask": bool} - whether to show the rating card now. Counted in NOTES, not days:
                              asked once the person has saved 5 notes; after "not now", again after 5 more notes;
                              after a rating, again after 25 more notes (and not within 30 days)
  POST /api/feedback          a rating, a reported problem, or "not now" (kind = rating | issue | snooze)

Stored in the `feedback` table (schema.sql section 47) and shown on the admin page. A rating of "poor" or any
reported problem also emails the admin (observability.alert - throttled, so it can't flood). Nothing from a note is
ever attached unless the person ticks "include this reply" themselves (the `include` context field).
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

import db
import observability
from api.auth import get_current_user_id
from api.rate_limit import limiter

router = APIRouter()

MIN_NOTES_BEFORE_ASKING = 5
NOTES_AFTER_NOT_NOW = 5       # skipped it? ask again after this many more notes
NOTES_AFTER_RATING = 25       # rated it? ask again after this many more notes...
DAYS_AFTER_RATING = 30        # ...and not before this many days
DAILY_CAP = 20  # per account - feedback is a few taps, never a stream

RATING_WORDS = {1: "poor", 2: "okay", 3: "good", 4: "loving it"}
# What the person can pick as reasons (rating) or category (problem). Anything else is dropped.
TAGS = {
    "wrong_answers", "slow", "confusing", "missing_feature", "other",
    "wrong_answer", "wrong_space", "broke", "idea",
}


class FeedbackIn(BaseModel):
    kind: str
    rating: Optional[int] = Field(None, ge=1, le=4)
    tags: list[str] = Field(default_factory=list, max_length=6)
    message: Optional[str] = Field(None, max_length=1500)
    screen: Optional[str] = Field(None, max_length=60)
    # app version, the last error's reference code, and (only if the person ticked it) the reply they are reporting
    context: dict = Field(default_factory=dict)


def _ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _asked_how_many_notes_ago(row: dict, total: int) -> int:
    try:
        return total - int((row.get("context") or {}).get("notes_at", 0))
    except (TypeError, ValueError):
        return total


@router.get("/prompt")
def prompt(user_id: str = Depends(get_current_user_id)):
    try:
        total = db.count_interactions(user_id)
        last = db.get_last_feedback(user_id, ["rating", "snooze"])
        if last is None:
            return {"ask": total >= MIN_NOTES_BEFORE_ASKING}
        since = _asked_how_many_notes_ago(last, total)
        if last["kind"] == "snooze":
            return {"ask": since >= NOTES_AFTER_NOT_NOW}
        old_enough = last["created_at"] <= _ago(DAYS_AFTER_RATING)
        return {"ask": since >= NOTES_AFTER_RATING and old_enough}
    except Exception:
        return {"ask": False}  # table not created yet (schema.sql section 47): never nag


def _clean_context(ctx: dict) -> dict:
    out = {}
    for key in ("app_version", "error_id", "about", "included"):
        value = ctx.get(key)
        if isinstance(value, str) and value.strip():
            out[key] = value.strip()[: 2000 if key == "included" else 80]
    return out


def _notes_now(user_id: str) -> int:
    """How many notes the person has saved right now - remembered so the next ask can be 'N notes later'."""
    try:
        return db.count_interactions(user_id)
    except Exception:
        return 0


@router.post("")
@limiter.limit("10/minute")
def send(request: Request, body: FeedbackIn, user_id: str = Depends(get_current_user_id)):
    if body.kind not in ("rating", "issue", "snooze"):
        raise HTTPException(400, "kind must be rating, issue or snooze")
    if body.kind == "rating" and body.rating is None:
        raise HTTPException(400, "A rating needs a rating from 1 to 4.")
    message = (body.message or "").strip() or None
    if body.kind == "issue" and not message:
        raise HTTPException(400, "Please say what went wrong.")
    if body.kind == "rating" and "other" in body.tags and not message:
        raise HTTPException(400, "You chose “Something else” - please tell us what.")
    try:
        if body.kind != "snooze" and db.count_feedback_since(user_id, _ago(1), ["rating", "issue"]) >= DAILY_CAP:
            raise HTTPException(429, "You've sent a lot of feedback today - thank you. Please try again tomorrow.")
        row = db.insert_feedback({
            "user_id": user_id,
            "kind": body.kind,
            "rating": body.rating if body.kind == "rating" else None,
            "tags": [t for t in body.tags if t in TAGS],
            "message": message[:1500] if message else None,
            "screen": (body.screen or "")[:60] or None,
            "context": {**_clean_context(body.context), "notes_at": _notes_now(user_id)},
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, "Feedback isn't available yet - please try again later.") from e

    if body.kind == "issue" or (body.kind == "rating" and (body.rating or 0) <= 1):
        try:
            who = db.get_user_email(user_id)
        except Exception:
            who = user_id
        what = "Problem reported" if body.kind == "issue" else "Poor rating"
        observability.alert(
            f"feedback:{body.kind}:{user_id}",
            f"{what} by {who}",
            f"{what} ({', '.join(row['tags']) or 'no category'}) on {row['screen'] or 'unknown screen'}.\n\n"
            f"{message or '(no message)'}\n\nSee the admin page → Feedback.",
        )
    return {"ok": True}
