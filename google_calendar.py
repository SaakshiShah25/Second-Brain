"""
google_calendar.py — Google Calendar OAuth (connect/refresh) and
per-task event sync ("Add to Calendar" button - see the Digest page).

Talks to Google's plain REST endpoints directly via `requests` rather
than the google-api-python-client/google-auth-oauthlib SDKs - the OAuth
token exchange/refresh and the Calendar API itself are both simple JSON
REST calls, and this keeps the dependency footprint the same shape as
llm_client.py's thin wrapper.

The Google account connection (OAuth, token refresh) is shared with Drive
and lives in google_oauth.py; see google_client.py for the one-time
Google Cloud Console setup.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Optional

import requests

import google_oauth

EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

# The OAuth connection itself (connect, token refresh, which features are
# granted) lives in google_oauth.py, shared with Drive - re-exported here
# so existing callers (api/routers/tasks.py) keep working unchanged.
NotConnectedError = google_oauth.NotConnectedError


def get_valid_access_token(user_id: str) -> str:
    return google_oauth.get_valid_access_token(user_id, "calendar")


def create_event(user_id: str, task: dict, event_date: Optional[str] = None) -> dict:
    """Creates an all-day Google Calendar event for `task` (a row shaped
    like db.get_task()'s return value - description, due_date, and the
    nested interaction->person for a human name in the summary). Returns
    {"calendar_event_id": ..., "html_link": ...}. Caller is responsible
    for persisting calendar_event_id onto the task row.

    `event_date` lets the actual calendar event land on a different day
    than the task's due_date - e.g. a "schedule a meeting with X" task due
    by the 24th, where the meeting itself should go on the calendar for
    the 21st. Defaults to due_date when not given (the original
    "reminder on the due date" behavior)."""
    target_date = event_date or task.get("due_date")
    if not target_date:
        raise ValueError("Task has no due_date - nothing to put on a calendar.")

    access_token = get_valid_access_token(user_id)
    start = date.fromisoformat(target_date)
    end = start + timedelta(days=1)  # Google's all-day events use an exclusive end date

    # Prefer the task's own directly-linked person (who this SPECIFIC
    # follow-up is about) over the interaction's primary person - they
    # differ when a note involved multiple people and this follow-up is
    # for someone other than whoever the note is primarily about.
    # Same owner-aware fallback as morning_brief.py's _format_task_line():
    # only default to the note's primary person when THEY own the task -
    # for a task I own with no one explicitly named, prefixing someone
    # else's name (e.g. "Sonali: Buy a sports t-shirt" for my own to-do)
    # is misleading, so leave the summary as just the task description.
    def _real_name(name):
        # "Unknown" is a real, explicit match, not the same as no person -
        # but showing it literally in an event title ("Unknown: buy
        # gear") reads as broken, so treat it the same as no name.
        return name if name and name.strip().lower() != "unknown" else None

    person_name = _real_name((task.get("person") or {}).get("name"))
    if not person_name and task.get("owner", "me") != "me":
        person_name = _real_name(((task.get("interaction") or {}).get("person") or {}).get("name"))
    summary = f"{person_name}: {task['description']}" if person_name else task["description"]
    description = "Created from MyConfía."
    if task.get("due_time"):
        description += f" Due by {str(task['due_time'])[:5]}."
    if event_date and task.get("due_date") and event_date != task["due_date"]:
        description += f" (Task due date: {task['due_date']})"

    resp = requests.post(
        EVENTS_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "summary": summary,
            "description": description,
            "start": {"date": start.isoformat()},
            "end": {"date": end.isoformat()},
            # Explicit reminder rather than relying on the calendar's
            # (often unset) default - Google's all-day-event reminders are
            # expressed as minutes before MIDNIGHT of the start date, so
            # 900 minutes (15h) before is "9:00 AM the day before", the
            # same anchor most calendar apps use as their all-day-event
            # default. Both a popup and an email alert, so it actually
            # reaches the user whether or not they have the calendar open.
            "reminders": {
                "useDefault": False,
                "overrides": [
                    {"method": "popup", "minutes": 900},
                    {"method": "email", "minutes": 900},
                ],
            },
        },
    )
    resp.raise_for_status()
    body = resp.json()
    return {"calendar_event_id": body["id"], "html_link": body.get("htmlLink")}


def list_events_for_date(user_id: str, target_date: str) -> list:
    """Lists calendar events overlapping `target_date` (YYYY-MM-DD) -
    used by morning_brief.py to include "what's on your calendar today"
    in the daily brief. Returns [] (not an error) if Google Calendar
    isn't connected, since the brief should still generate without it."""
    try:
        access_token = get_valid_access_token(user_id)
    except NotConnectedError:
        return []

    day = date.fromisoformat(target_date)
    time_min = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    time_max = time_min + timedelta(days=1)

    resp = requests.get(
        EVENTS_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "timeMin": time_min.isoformat(),
            "timeMax": time_max.isoformat(),
            "singleEvents": "true",
            "orderBy": "startTime",
        },
    )
    resp.raise_for_status()
    events = []
    for item in resp.json().get("items", []):
        start = item.get("start", {})
        events.append({
            "summary": item.get("summary", "(no title)"),
            "start": start.get("dateTime") or start.get("date"),
            "all_day": "date" in start,
            "html_link": item.get("htmlLink"),
        })
    return events


def delete_event(user_id: str, event_id: str) -> None:
    access_token = get_valid_access_token(user_id)
    resp = requests.delete(f"{EVENTS_URL}/{event_id}", headers={"Authorization": f"Bearer {access_token}"})
    # 404/410 means it's already gone on Google's side - not an error for our purposes.
    if resp.status_code not in (200, 204, 404, 410):
        resp.raise_for_status()
