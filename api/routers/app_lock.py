"""
api/routers/app_lock.py - the account-wide app-lock PIN (see app_lock.py).

Every response about a PIN is {"enabled", "ok", "retry_after"} with a 200:
a wrong PIN is an expected outcome, not an HTTP error, and "retry_after"
(seconds) says how long the account is locked out after repeated misses.
"""

from fastapi import APIRouter, Depends, HTTPException, Request

import app_lock
import db
from api.auth import get_current_user_id
from api.rate_limit import limiter
from api.schemas import AppLockDisable, AppLockSet, AppLockVerify

router = APIRouter()


@router.get("")
def status(user_id: str = Depends(get_current_user_id)):
    return {"enabled": app_lock.is_enabled(user_id)}


@router.post("/verify")
@limiter.limit("30/minute")
def verify(request: Request, body: AppLockVerify, user_id: str = Depends(get_current_user_id)):
    return app_lock.check_pin(user_id, body.pin)


@router.put("")
@limiter.limit("20/minute")
def set_pin(request: Request, body: AppLockSet, user_id: str = Depends(get_current_user_id)):
    """Sets the PIN, or changes it. Changing (or re-setting) an existing PIN
    needs the current one, so someone at an unlocked phone can't quietly
    replace it."""
    if app_lock.is_enabled(user_id):
        result = app_lock.check_pin(user_id, body.current_pin or "")
        if not result["ok"]:
            return result
    try:
        app_lock.set_pin(user_id, body.pin)
    except db.AppLockUnavailable:
        raise HTTPException(503, "App lock isn't available yet - the database needs an update.")
    return {"enabled": True, "ok": True, "retry_after": 0}


@router.post("/disable")
@limiter.limit("20/minute")
def disable(request: Request, body: AppLockDisable, user_id: str = Depends(get_current_user_id)):
    result = app_lock.check_pin(user_id, body.pin)
    if result["enabled"] and not result["ok"]:
        return result
    app_lock.disable(user_id)
    return {"enabled": False, "ok": True, "retry_after": 0}
