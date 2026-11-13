"""
api/routers/feedback.py — "How is MyConfía working for you?" ratings and "Report a problem".

  GET  /api/feedback/prompt   {"ask": bool} - whether to show the rating card now: the person has saved a few
                              notes, hasn't rated in the last 60 days and hasn't said "not now" in the last 30
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
RATING_COOLDOWN_DAYS = 60
SNOOZE_DAYS = 30
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


@router.get("/prompt")
def prompt(user_id: str = Depends(get_current_user_id)):
    try:
        if db.count_interactions(user_id) < MIN_NOTES_BEFORE_ASKING:
            return {"ask": False}
        rated = db.count_feedback_since(user_id, _ago(RATING_COOLDOWN_DAYS), ["rating"])
        snoozed = db.count_feedback_since(user_id, _ago(SNOOZE_DAYS), ["snooze"])
        return {"ask": rated == 0 and snoozed == 0}
    except Exception:
        return {"ask": False}  # table not created yet (schema.sql section 47): never nag


def _clean_context(ctx: dict) -> dict:
    out = {}
    for key in ("app_version", "error_id", "about", "included"):
        value = ctx.get(key)
        if isinstance(value, str) and value.strip():
            out[key] = value.strip()[: 2000 if key == "included" else 80]
    return out


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
            "context": _clean_context(body.context),
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
