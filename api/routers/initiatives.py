"""
api/routers/initiatives.py — CRUD for user-managed "initiatives" (life
areas/projects a note gets auto-classified into at capture time, e.g.
Tenaxis AI/Personal/Job/Fitness). Shape mirrors api/routers/tasks.py's
list/create/update/delete pattern; the "create a default set on first
read" behavior lives in db.get_initiatives() (mirrors
db.get_user_preference()'s same create-default-on-first-read shape).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import db
import initiative_digest
import search_index
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


class InitiativeOrder(BaseModel):
    ids: list[int]


@router.put("/order")
def reorder_initiatives(body: InitiativeOrder, user_id: str = Depends(get_current_user_id)):
    """The user's own order for their initiatives, first to last."""
    return {"saved": db.reorder_initiatives(user_id, body.ids)}


@router.get("/{initiative_id}/digest")
def get_digest(initiative_id: int, user_id: str = Depends(get_current_user_id)):
    """The initiative as one page: a one-line summary and its notes' points
    in short sections (initiative_digest.py). 0 = notes with no initiative."""
    if initiative_id == initiative_digest.OTHERS:
        name = "Other notes"
    else:
        match = next((i for i in db.get_initiatives(user_id) if i["id"] == initiative_id), None)
        if not match:
            raise HTTPException(404, "No such initiative.")
        name = match["name"]
    return initiative_digest.get_digest(user_id, initiative_id, name)


@router.patch("/{initiative_id}")
def update_initiative(initiative_id: int, body: InitiativeUpdate, user_id: str = Depends(get_current_user_id)):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "Nothing to update.")
    updated = db.update_initiative(user_id, initiative_id, **fields)
    _reindex_notes_in(user_id, initiative_id)  # the name appears in their index text
    return updated


@router.delete("/{initiative_id}")
def delete_initiative(initiative_id: int, user_id: str = Depends(get_current_user_id)):
    note_ids = _note_ids_in(user_id, initiative_id)
    db.delete_initiative(user_id, initiative_id)
    search_index.enqueue(user_id, "note", note_ids)
    return {"ok": True}


def _note_ids_in(user_id: str, initiative_id: int) -> list:
    return [n["id"] for n in db.get_all_interactions(user_id) if n.get("initiative_id") == initiative_id]


def _reindex_notes_in(user_id: str, initiative_id: int) -> None:
    search_index.enqueue(user_id, "note", _note_ids_in(user_id, initiative_id))
