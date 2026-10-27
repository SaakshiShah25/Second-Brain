"""
api/routers/notes.py — The Notes page: every note (joined with its
category), and editing / deleting one. Editing re-embeds the text so the
note keeps matching what it now says, and re-queues it (and its tasks) for
the search index.
"""

from fastapi import APIRouter, Depends

import db
import embeddings
import search_index
from api.auth import get_current_user_id
from api.schemas import InteractionUpdate

router = APIRouter()


@router.get("")
def list_notes(user_id: str = Depends(get_current_user_id)):
    return db.get_all_interactions_with_context(user_id)


@router.patch("/{interaction_id}")
def update_note(interaction_id: int, body: InteractionUpdate, user_id: str = Depends(get_current_user_id)):
    # exclude_unset (not "is not None") so a field explicitly sent as null
    # - like initiative_id, to uncategorize a note back to "Uncategorized"
    # - is distinguishable from a field the client simply didn't include.
    fields = body.model_dump(exclude_unset=True)
    if fields.get("raw_text"):
        # The note's own embedding (fixed ask path) used to keep matching the OLD text.
        fields["embedding"] = embeddings.compute_embedding(fields["raw_text"])
    if fields:
        db.update_interaction(user_id, interaction_id, **fields)
        search_index.enqueue(user_id, "note", [interaction_id])
        search_index.enqueue(user_id, "task", [t["id"] for t in db.get_tasks_for_interactions(user_id, [interaction_id])])
    return {"ok": True}


@router.delete("/{interaction_id}")
def delete_note(interaction_id: int, user_id: str = Depends(get_current_user_id)):
    db.delete_interaction(user_id, interaction_id)
    search_index.enqueue(user_id, "note", [], prune_after=True)
    return {"ok": True}
