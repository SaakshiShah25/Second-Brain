"""
api/routers/settings.py — Per-account settings: theme/font-size
preference, usage mode (work/personal/both) and Terms of Service
acceptance. Stored server-side (not just
localStorage) so a choice made on the web app also applies on the
Android app, since both point at the same account. See db.py's
get_user_preference()/update_user_preference() and schema.sql section 18.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

import db
from api.auth import get_current_user_id
from api.schemas import UserPreferenceUpdate

router = APIRouter()

_THEMES = {"dark", "light"}
_FONT_SIZES = {"small", "default", "large"}
_USAGE_MODES = {"work", "personal", "both"}


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
    if body.usage_mode is not None:
        if body.usage_mode not in _USAGE_MODES:
            raise HTTPException(400, f"usage_mode must be one of {sorted(_USAGE_MODES)}")
        fields["usage_mode"] = body.usage_mode
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


@router.get("/export")
def export_data(user_id: str = Depends(get_current_user_id)):
    """Everything the user has stored, decrypted, as one JSON download -
    notes, tasks, initiatives and settings. Search vectors and other
    derived data are left out; they're rebuilt from these."""
    drop = {"embedding", "user_id"}
    clean = lambda rows: [{k: v for k, v in r.items() if k not in drop} for r in rows]
    tasks = [{k: v for k, v in t.items() if k != "interaction"} for t in db.get_all_tasks_with_context(user_id)]
    body = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "email": db.get_user_email(user_id),
        "initiatives": clean(db.get_initiatives(user_id)),
        "notes": clean(db.get_all_interactions_with_context(user_id)),
        "tasks": clean(tasks),
        "settings": {k: v for k, v in db.get_user_preference(user_id).items() if k not in drop},
    }
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return JSONResponse(body, headers={"Content-Disposition": f'attachment; filename="myconfia-export-{stamp}.json"'})


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
