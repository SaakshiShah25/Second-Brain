"""
api/routers/lists.py — The user's lists (Movies, Books, Groceries, Birthdays...):
list them, create one, rename one / change its emoji, delete one with its items.
The items themselves are read and edited through api/routers/tasks.py; the main
Tasks list isn't a row here - it's every item with no list.
"""

from fastapi import APIRouter, Depends, HTTPException

import db
import search_index
import text_utils
from api.auth import get_current_user_id
from api.schemas import ListCreate, ListUpdate

router = APIRouter()


def _clean_name(name) -> str:
    name = " ".join((name or "").split())
    if not name:
        raise HTTPException(400, "A list needs a name.")
    if name.lower() in text_utils.MAIN_LIST_NAMES:
        raise HTTPException(400, "That's the name of your main Tasks list - pick another.")
    return name


def _check_space(user_id: str, initiative_id) -> None:
    if initiative_id is not None and not db.get_initiative(user_id, initiative_id):
        raise HTTPException(400, "That space doesn't exist.")


@router.get("")
def get_lists(user_id: str = Depends(get_current_user_id)):
    return db.get_lists(user_id)


@router.post("")
def create_list(body: ListCreate, user_id: str = Depends(get_current_user_id)):
    name = _clean_name(body.name)
    _check_space(user_id, body.initiative_id)
    if db.find_list(user_id, name, body.initiative_id):
        raise HTTPException(409, f"This space already has a list called '{name}'.")
    return db.create_list(user_id, name, body.emoji or text_utils.list_emoji(name), initiative_id=body.initiative_id)


@router.patch("/{list_id}")
def update_list(list_id: int, body: ListUpdate, user_id: str = Depends(get_current_user_id)):
    if not db.get_list(user_id, list_id):
        raise HTTPException(404, "That list doesn't exist.")
    fields = {}
    if body.name is not None:
        name = _clean_name(body.name)
        current = db.get_list(user_id, list_id)
        other = db.find_list(user_id, name, current.get("initiative_id"))
        if other and other["id"] != list_id:
            raise HTTPException(409, f"This space already has a list called '{name}'.")
        fields["name"] = name
    if body.emoji is not None:
        fields["emoji"] = body.emoji.strip() or text_utils.list_emoji(fields.get("name", ""))
    if "initiative_id" in body.model_fields_set:
        _check_space(user_id, body.initiative_id)
        if db.list_space_supported():
            current = db.get_list(user_id, list_id)
            other = db.find_list(user_id, fields.get("name") or current["name"], body.initiative_id)
            if other and other["id"] != list_id:
                raise HTTPException(409, f"That space already has a list called '{current['name']}'.")
            fields["initiative_id"] = body.initiative_id
            db.set_list_tasks_space(user_id, list_id, body.initiative_id)  # its entries move with it
    return db.update_list(user_id, list_id, **fields)


@router.delete("/{list_id}")
def delete_list(list_id: int, user_id: str = Depends(get_current_user_id)):
    db.delete_list(user_id, list_id)
    search_index.enqueue(user_id, "task", [], prune_after=True)
    return {"ok": True}
