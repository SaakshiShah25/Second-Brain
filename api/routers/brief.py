"""
api/routers/brief.py — The daily morning brief: what's due today, what's
on the calendar, and who's gone quiet (see morning_brief.py for how it's
assembled). Three ways to get it:
  - GET /morning - the in-app view (Digest page).
  - POST /send-email - emails it to the logged-in user right now, an
    explicit per-click action regardless of their daily_brief_email_enabled
    preference.
  - POST /send-daily-emails - the scheduled broadcast (run by
    .github/workflows/morning-brief.yml on a cron), sending to every user
    who's opted in. There's no single logged-in user for a broadcast job,
    so this is protected by a shared secret header instead of a login.
"""

import os
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException

import db
import email_client
import morning_brief
from api.auth import get_current_user_id

router = APIRouter()


def _brief_subject() -> str:
    # e.g. "Your Confía morning brief - Wednesday, August 26, 2026" -
    # dated so it's identifiable at a glance in an inbox full of them.
    return f"Your Confía morning brief - {date.today().strftime('%A, %B %d, %Y')}"


@router.get("/morning")
def get_morning_brief(user_id: str = Depends(get_current_user_id)):
    return {"brief": morning_brief.generate_morning_brief(user_id)}


@router.post("/send-email")
def send_my_brief_email(user_id: str = Depends(get_current_user_id)):
    brief = morning_brief.generate_morning_brief(user_id)
    to_email = db.get_user_email(user_id)
    try:
        email_client.send_markdown_email(to_email, _brief_subject(), brief)
    except email_client.NotConfiguredError as e:
        raise HTTPException(409, str(e))
    except Exception as e:
        raise HTTPException(502, f"Couldn't send the email: {e}")
    return {"ok": True, "sent_to": to_email}


@router.post("/send-daily-emails")
def send_daily_emails(x_cron_secret: str = Header(None)):
    expected = os.environ.get("CRON_SECRET")
    if not expected or x_cron_secret != expected:
        raise HTTPException(403, "Invalid or missing cron secret.")

    subject = _brief_subject()
    results = []
    for user_id in db.get_users_with_daily_brief_enabled():
        try:
            brief = morning_brief.generate_morning_brief(user_id)
            to_email = db.get_user_email(user_id)
            email_client.send_markdown_email(to_email, subject, brief)
            results.append({"user_id": user_id, "ok": True})
        except Exception as e:
            results.append({"user_id": user_id, "ok": False, "error": str(e)})
    return {"sent": results}
