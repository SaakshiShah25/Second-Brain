"""
api/routers/notes.py — "All Notes" page data source: every interaction
regardless of whether it has a person, joined with person/initiative
names (see db.get_all_interactions_with_context). Editing/deleting a
note reuses the existing PATCH/DELETE /api/people/interactions/{id}
endpoints (people.py) - those were already generic over any interaction,
not person-scoped, so this router only needs the list endpoint.
"""

from fastapi import APIRouter, Depends

import db
from api.auth import get_current_user_id

router = APIRouter()


@router.get("")
def list_notes(user_id: str = Depends(get_current_user_id)):
    return db.get_all_interactions_with_context(user_id)
