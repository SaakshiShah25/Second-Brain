"""
google_calendar.py — Google Calendar OAuth (connect/refresh) and
per-task event sync ("Add to Calendar" button - see the Digest page).

Talks to Google's plain REST endpoints directly via `requests` rather
than the google-api-python-client/google-auth-oauthlib SDKs - the OAuth
token exchange/refresh and the Calendar API itself are both simple JSON
REST calls, and this keeps the dependency footprint the same shape as
llm_client.py's thin wrapper.

See google_client.py's module docstring for the one-time Google Cloud
Console setup this depends on (OAuth client id/secret, redirect URI).
"""

from datetime import date, datetime, timedelta, timezone

import requests

import db
from google_client import get_oauth_config

TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
SCOPE = "https://www.googleapis.com/auth/calendar.events"


class NotConnectedError(Exception):
    """Raised when a caller asks to sync a task but this user hasn't
    connected Google Calendar yet."""


def build_authorize_url(state: str) -> str:
    config = get_oauth_config()
    params = {
        "client_id": config.client_id,
        "redirect_uri": config.redirect_uri,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",  # required to receive a refresh_token
        "prompt": "consent",       # force a refresh_token even on repeat connects
        "state": state,
    }
    query = "&".join(f"{k}={requests.utils.quote(v)}" for k, v in params.items())
    return f"{AUTH_URL}?{query}"


def exchange_code(user_id: str, code: str) -> None:
    """Exchanges an OAuth authorization code for an access+refresh token
    pair and stores it (see db.upsert_google_credentials)."""
    config = get_oauth_config()
    resp = requests.post(TOKEN_URL, data={
        "code": code,
        "client_id": config.client_id,
        "client_secret": config.client_secret,
        "redirect_uri": config.redirect_uri,
        "grant_type": "authorization_code",
    })
    resp.raise_for_status()
    body = resp.json()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=body["expires_in"])
    db.upsert_google_credentials(
        user_id,
        access_token=body["access_token"],
        refresh_token=body["refresh_token"],
        expires_at=expires_at.isoformat(),
        scope=body.get("scope", SCOPE),
    )


def _refresh_access_token(user_id: str, refresh_token: str) -> str:
    config = get_oauth_config()
    resp = requests.post(TOKEN_URL, data={
        "refresh_token": refresh_token,
        "client_id": config.client_id,
        "client_secret": config.client_secret,
        "grant_type": "refresh_token",
    })
    resp.raise_for_status()
    body = resp.json()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=body["expires_in"])
    db.update_google_access_token(user_id, access_token=body["access_token"], expires_at=expires_at.isoformat())
    return body["access_token"]


def get_valid_access_token(user_id: str) -> str:
    creds = db.get_google_credentials(user_id)
    if not creds:
        raise NotConnectedError("Google Calendar isn't connected for this account yet.")
    expires_at = datetime.fromisoformat(creds["expires_at"])
    if expires_at <= datetime.now(timezone.utc) + timedelta(seconds=60):
        return _refresh_access_token(user_id, creds["refresh_token"])
    return creds["access_token"]


def create_event(user_id: str, task: dict) -> dict:
    """Creates an all-day Google Calendar event for `task` (a row shaped
    like db.get_task()'s return value - description, due_date, and the
    nested interaction->person for a human name in the summary). Returns
    {"calendar_event_id": ..., "html_link": ...}. Caller is responsible
    for persisting calendar_event_id onto the task row."""
    if not task.get("due_date"):
        raise ValueError("Task has no due_date - nothing to put on a calendar.")

    access_token = get_valid_access_token(user_id)
    start = date.fromisoformat(task["due_date"])
    end = start + timedelta(days=1)  # Google's all-day events use an exclusive end date

    person_name = ((task.get("interaction") or {}).get("person") or {}).get("name")
    summary = f"{person_name}: {task['description']}" if person_name else task["description"]

    resp = requests.post(
        EVENTS_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "summary": summary,
            "description": "Created from Second Brain.",
            "start": {"date": start.isoformat()},
            "end": {"date": end.isoformat()},
        },
    )
    resp.raise_for_status()
    body = resp.json()
    return {"calendar_event_id": body["id"], "html_link": body.get("htmlLink")}


def delete_event(user_id: str, event_id: str) -> None:
    access_token = get_valid_access_token(user_id)
    resp = requests.delete(f"{EVENTS_URL}/{event_id}", headers={"Authorization": f"Bearer {access_token}"})
    # 404/410 means it's already gone on Google's side - not an error for our purposes.
    if resp.status_code not in (200, 204, 404, 410):
        resp.raise_for_status()
