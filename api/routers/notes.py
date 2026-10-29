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


def with_sources(rows: list) -> list:
    """Adds what the Notes page needs to treat the notes of one message as one: a note that points at the original
    (source_id) shows the original's text, and every note lists the OTHER initiatives its message also touched
    (`also_in`; `shared_original` is true when deleting this note also deletes the others). A message's notes are grouped by their shared source, or by a batch id on older/unlinked ones."""
    by_id = {r["id"]: r for r in rows}

    def key(r):
        return r.get("source_id") or (r.get("extracted_facts") or {}).get("batch") or r["id"]

    def label(r):
        return (r.get("initiative") or {}).get("name") or "Others"

    groups: dict = {}
    for r in rows:
        groups.setdefault(key(r), []).append(r)
    sources = {r["source_id"] for r in rows if r.get("source_id")}
    for r in rows:
        source = by_id.get(r.get("source_id"))
        if source is not None and not r.get("raw_text"):
            r["raw_text"] = source.get("raw_text") or ""
        mine = label(r)
        # deleting the original removes the notes that point at it, so the page warns before it does
        r["shared_original"] = bool(r.get("source_id")) or r["id"] in sources
        r["also_in"] = sorted({label(o) for o in groups[key(r)] if o["id"] != r["id"]} - {mine})
    return rows


@router.get("")
def list_notes(user_id: str = Depends(get_current_user_id)):
    return with_sources(db.get_all_interactions_with_context(user_id))


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
