"""
api/routers/calendar.py — Google Calendar connect/disconnect/status.

The OAuth callback (GET /oauth/callback) is deliberately NOT behind
Depends(get_current_user_id) - it's reached by Google's own browser
redirect, which carries no Authorization header. See google_calendar.py's
module docstring and POST /connect/start below for how the `state`
parameter carries the user's identity across that unauthenticated hop
instead.
"""

import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

import db
import google_calendar
from api.auth import get_current_user_id

router = APIRouter()

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


@router.post("/connect/start")
def connect_start(user_id: str = Depends(get_current_user_id)):
    try:
        state = secrets.token_urlsafe(32)
        db.create_oauth_state(state, user_id)
        return {"authorize_url": google_calendar.build_authorize_url(state)}
    except RuntimeError as e:
        # GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI not configured yet - see
        # google_client.py's module docstring for setup steps.
        raise HTTPException(503, str(e))


@router.get("/oauth/callback")
def oauth_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error:
        return RedirectResponse(f"{FRONTEND_URL}/digest?calendar=error")
    if not code or not state:
        raise HTTPException(400, "Missing code or state")

    user_id = db.consume_oauth_state(state)
    if not user_id:
        raise HTTPException(400, "This connection link has expired or was already used - try connecting again.")

    try:
        google_calendar.exchange_code(user_id, code)
    except Exception:
        return RedirectResponse(f"{FRONTEND_URL}/digest?calendar=error")
    return RedirectResponse(f"{FRONTEND_URL}/digest?calendar=connected")


@router.get("/status")
def status(user_id: str = Depends(get_current_user_id)):
    creds = db.get_google_credentials(user_id)
    return {"connected": creds is not None}


@router.post("/disconnect")
def disconnect(user_id: str = Depends(get_current_user_id)):
    db.delete_google_credentials(user_id)
    return {"ok": True}
