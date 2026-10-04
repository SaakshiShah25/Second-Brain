"""
api/routers/initiatives.py — CRUD for user-managed "initiatives" (life
areas/projects a note gets auto-classified into at capture time, e.g.
Tenaxis AI/Personal/Job/Fitness). Shape mirrors api/routers/tasks.py's
list/create/update/delete pattern; the "create a default set on first
read" behavior lives in db.get_initiatives() (mirrors
db.get_user_preference()'s same create-default-on-first-read shape).
"""

from fastapi import APIRouter, Depends, HTTPException

import db
from api.auth import get_current_user_id
from api.schemas import InitiativeCreate, InitiativeUpdate

router = APIRouter()


@router.get("")
def list_initiatives(user_id: str = Depends(get_current_user_id)):
    return db.get_initiatives(user_id)


@router.post("")
def create_initiative(body: InitiativeCreate, user_id: str = Depends(get_current_user_id)):
    if not body.name.strip():
        raise HTTPException(400, "Name is required.")
    try:
        return db.create_initiative(user_id, name=body.name.strip(), color=body.color)
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.patch("/{initiative_id}")
def update_initiative(initiative_id: int, body: InitiativeUpdate, user_id: str = Depends(get_current_user_id)):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "Nothing to update.")
    return db.update_initiative(user_id, initiative_id, **fields)


@router.delete("/{initiative_id}")
def delete_initiative(initiative_id: int, user_id: str = Depends(get_current_user_id)):
    db.delete_initiative(user_id, initiative_id)
    return {"ok": True}
