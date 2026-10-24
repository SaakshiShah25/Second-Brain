"""
api/routers/calendar.py — Google Calendar connect/disconnect/status.

Kept for the Today page's existing calls; the connection itself is now the
single shared Google connection (google_oauth.py / api/routers/google.py),
asked for just the "calendar" feature here. The old callback path stays as
an alias so an OAuth client still configured with it keeps working.
"""

from typing import Optional

from fastapi import APIRouter, Depends

import google_oauth
from api.auth import get_current_user_id
from api.routers import google as google_router

router = APIRouter()


@router.post("/connect/start")
def connect_start(user_id: str = Depends(get_current_user_id)):
    return google_router.start_connect(user_id, ["calendar"], "digest")


@router.get("/oauth/callback")
def oauth_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    return google_router.handle_callback(code, state, error)


@router.get("/status")
def status(user_id: str = Depends(get_current_user_id)):
    return {"connected": "calendar" in google_oauth.status(user_id)["features"]}


@router.post("/disconnect")
def disconnect(user_id: str = Depends(get_current_user_id)):
    """Calendar-only callers get the same full disconnect - there is one
    Google connection, not one per feature."""
    return google_router.disconnect(user_id)
