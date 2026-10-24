"""
api/routers/google.py — The single Google account connection (see
google_oauth.py) and Google Drive folders (google_drive.py).

The OAuth callback is deliberately NOT behind get_current_user_id - it's
reached by Google's browser redirect, which carries no Authorization
header. The `state` nonce (db.create_oauth_state) carries the user's
identity across that hop, plus which screen to return to.
"""

import logging
import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

import db
import google_drive
import google_oauth
from api.auth import get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter()

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
# Screens a connect flow may return to (allow-list - never an arbitrary URL).
_RETURN_PATHS = {"settings": "/settings", "documents": "/documents", "digest": "/digest"}


class ConnectStart(BaseModel):
    features: list[str] = ["calendar", "drive"]
    return_to: str = "settings"


class AddFolder(BaseModel):
    folder_id: str


def _configured() -> bool:
    return bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET")
                and os.environ.get("GOOGLE_OAUTH_REDIRECT_URI"))


@router.get("/status")
def status(user_id: str = Depends(get_current_user_id)):
    return {**google_oauth.status(user_id), "configured": _configured()}


def start_connect(user_id: str, features: list, return_to: str) -> dict:
    """Shared with the legacy /api/calendar/connect/start route."""
    features = [f for f in features if f in google_oauth.FEATURES]
    if not features:
        raise HTTPException(400, f"features must include one of {list(google_oauth.FEATURES)}")
    if not _configured():
        raise HTTPException(503, "Google isn't set up on this server yet (GOOGLE_CLIENT_ID / "
                                 "GOOGLE_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI).")
    target = return_to if return_to in _RETURN_PATHS else "settings"
    state = f"{secrets.token_urlsafe(32)}~{target}"
    db.create_oauth_state(state, user_id)
    try:
        login_hint = db.get_user_email(user_id)  # one-tap consent when it's the same Google account
    except Exception:
        login_hint = None
    return {"authorize_url": google_oauth.build_authorize_url(state, features, login_hint)}


@router.post("/connect/start")
def connect_start(body: ConnectStart, user_id: str = Depends(get_current_user_id)):
    return start_connect(user_id, body.features, body.return_to)


def handle_callback(code: Optional[str], state: Optional[str], error: Optional[str]) -> RedirectResponse:
    target = (state or "").rsplit("~", 1)[-1] if state and "~" in state else "settings"
    path = _RETURN_PATHS.get(target, "/settings")
    if error:
        # "access_denied" = the user pressed Cancel on Google's screen.
        result = "cancelled" if error == "access_denied" else "error"
        return RedirectResponse(f"{FRONTEND_URL}{path}?google={result}")
    if not code or not state:
        raise HTTPException(400, "Missing code or state")
    user_id = db.consume_oauth_state(state)
    if not user_id:
        return RedirectResponse(f"{FRONTEND_URL}{path}?google=expired")
    try:
        features = google_oauth.exchange_code(user_id, code)
    except Exception:
        logger.exception("Google OAuth exchange failed for user %s", user_id)
        return RedirectResponse(f"{FRONTEND_URL}{path}?google=error")
    return RedirectResponse(f"{FRONTEND_URL}{path}?google=connected&features={','.join(features)}")


@router.get("/oauth/callback")
def oauth_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    return handle_callback(code, state, error)


@router.post("/disconnect")
def disconnect(user_id: str = Depends(get_current_user_id)):
    google_drive.remove_all(user_id)
    google_oauth.disconnect(user_id)
    return {"ok": True}


# ---------------------------------------------------------------- Drive

def _drive_call(fn, *args):
    try:
        return fn(*args)
    except google_oauth.NotConnectedError as e:
        raise HTTPException(409, str(e))


@router.get("/drive/browse")
def drive_browse(parent: str = "root", q: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    folders = _drive_call(google_drive.list_folders, user_id, parent, q)
    name = "Search results" if q else _drive_call(google_drive.folder_name, user_id, parent)
    return {"id": parent, "name": name, "folders": folders}


@router.get("/drive/folders")
def drive_folders(user_id: str = Depends(get_current_user_id)):
    if "drive" in google_oauth.status(user_id)["features"]:
        google_drive.sync_stale_folders(user_id)
    rows = db.get_drive_folders(user_id)
    for r in rows:
        r["syncing"] = r["status"] == "syncing" or google_drive.is_syncing(user_id, r["id"])
    return rows


@router.post("/drive/folders")
def add_drive_folder(body: AddFolder, user_id: str = Depends(get_current_user_id)):
    name = _drive_call(google_drive.folder_name, user_id, body.folder_id)
    row = db.create_drive_folder(user_id, body.folder_id, name)
    google_drive.start_sync(user_id, row["id"])
    return {**row, "syncing": True}


@router.post("/drive/folders/{folder_row_id}/sync")
def sync_drive_folder(folder_row_id: int, user_id: str = Depends(get_current_user_id)):
    if not db.get_drive_folder(user_id, folder_row_id):
        raise HTTPException(404, "Folder not found")
    started = google_drive.start_sync(user_id, folder_row_id)
    return {"started": started}


@router.delete("/drive/folders/{folder_row_id}", status_code=204)
def remove_drive_folder(folder_row_id: int, user_id: str = Depends(get_current_user_id)):
    if not db.get_drive_folder(user_id, folder_row_id):
        raise HTTPException(404, "Folder not found")
    google_drive.remove_folder(user_id, folder_row_id)
