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
