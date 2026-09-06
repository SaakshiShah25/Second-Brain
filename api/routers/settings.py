"""
api/routers/settings.py — Per-account settings: theme/font-size
preference and Terms of Service acceptance. Stored server-side (not just
localStorage) so a choice made on the web app also applies on the
Android app, since both point at the same account. See db.py's
get_user_preference()/update_user_preference() and schema.sql section 18.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

import db
from api.auth import get_current_user_id
from api.schemas import UserPreferenceUpdate

router = APIRouter()

_THEMES = {"dark", "light"}
_FONT_SIZES = {"small", "default", "large"}


@router.get("")
def get_settings(user_id: str = Depends(get_current_user_id)):
    return db.get_user_preference(user_id)


@router.patch("")
def update_settings(body: UserPreferenceUpdate, user_id: str = Depends(get_current_user_id)):
    fields = {}
    if body.theme is not None:
        if body.theme not in _THEMES:
            raise HTTPException(400, f"theme must be one of {sorted(_THEMES)}")
        fields["theme"] = body.theme
    if body.font_size is not None:
        if body.font_size not in _FONT_SIZES:
            raise HTTPException(400, f"font_size must be one of {sorted(_FONT_SIZES)}")
        fields["font_size"] = body.font_size
    if body.daily_brief_email_enabled is not None:
        fields["daily_brief_email_enabled"] = body.daily_brief_email_enabled
    if not fields:
        return db.get_user_preference(user_id)
    return db.update_user_preference(user_id, **fields)


@router.post("/accept-terms")
def accept_terms(user_id: str = Depends(get_current_user_id)):
    return db.update_user_preference(user_id, terms_accepted_at=datetime.now(timezone.utc).isoformat())


@router.post("/complete-tour")
def complete_tour(user_id: str = Depends(get_current_user_id)):
    """Marks the onboarding tour as seen - called whether the user finished
    it or hit Skip, same binary semantics as accept_terms() above."""
    return db.update_user_preference(user_id, tour_completed_at=datetime.now(timezone.utc).isoformat())


@router.delete("/account", status_code=204)
def delete_account(user_id: str = Depends(get_current_user_id)):
    """Play Store's required account-and-data deletion action (Google's
    "Account Deletion" policy: any app that supports creating an account
    must let a user delete it, and everything tied to it). `user_id` is
    the caller's own verified id from their session token - there is no
    way to pass a different id here, so this can only ever delete your
    own account. See db.delete_account() for what actually gets removed
    (everything, via cascading foreign keys - one call covers it)."""
    db.delete_account(user_id)
