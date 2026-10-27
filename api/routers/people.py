"""
api/routers/people.py — REST equivalent of views/people_view.py (browse/
edit/merge a person, edit/delete an interaction, get a briefing), plus
the "relationships gone quiet" half of views/digest_view.py (belongs
here since it's fundamentally a /people query, not a /tasks one).
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException

import db
import embeddings
import graph
import memory_schema
import retrieval
import search_index
from api.auth import get_current_user_id
from api.schemas import (AddPersonalNoteRequest, InteractionUpdate, KeyDateCreate, MergeRequest,
                         PersonFactCreate, PersonUpdate)

router = APIRouter()


def _days_ago(date_str: str) -> int:
    return (date.today() - datetime.fromisoformat(date_str).date()).days


@router.get("")
def list_people(user_id: str = Depends(get_current_user_id)):
    return db.get_all_people(user_id)


@router.get("/stale")
def stale_people(threshold_days: int = 30, user_id: str = Depends(get_current_user_id)):
    people = db.get_people_with_last_interaction(user_id)
    stale = [
        {**p, "days_ago": _days_ago(p["last_interaction_date"])}
        for p in people
        if p.get("last_interaction_date") and _days_ago(p["last_interaction_date"]) >= threshold_days
    ]
    stale.sort(key=lambda p: p["last_interaction_date"])
    return stale


@router.get("/companies")
def list_companies(user_id: str = Depends(get_current_user_id)):
    """Groups people by company, folding case/punctuation/legal suffixes
    (graph.org_key) - "Northwind", "northwind" and "Northwind Pvt Ltd" are
    one company. Shown under the most common spelling."""
    grouped: dict[str, list] = {}
    spellings: dict[str, dict] = {}
    for p in db.get_all_people(user_id):
        company = (p.get("company") or "").strip()
        key = graph.org_key(company)
        if not key:
            continue
        grouped.setdefault(key, []).append(p)
        spellings.setdefault(key, {})[company] = spellings.get(key, {}).get(company, 0) + 1
    return [
        {
            "company": max(spellings[key], key=spellings[key].get),
            "people": [{"id": p["id"], "name": p["name"], "role": p.get("role") or ""} for p in members],
        }
        for key, members in sorted(grouped.items())
    ]


@router.get("/companies/{company}/briefing")
def get_company_briefing(company: str, user_id: str = Depends(get_current_user_id)):
    return {"briefing": retrieval.generate_company_briefing(user_id, company)}


@router.get("/{person_id}")
def get_person(person_id: int, user_id: str = Depends(get_current_user_id)):
    # db.get_person() uses a Supabase .single() query, which raises
    # (rather than returning None) when no row matches - convert that
    # into a proper 404 instead of letting it fall through as a 500.
    try:
        person = db.get_person(user_id, person_id)
    except Exception:
        raise HTTPException(404, "Person not found")
    if not person:
        raise HTTPException(404, "Person not found")
    interactions = retrieval.attach_tasks(user_id, db.get_interactions_for_person(user_id, person_id))
    secondary = db.get_secondary_interactions_for_person(user_id, person_id)
    return {"person": person, "interactions": interactions, "mentioned_in": secondary,
            "memory": _memory_or_empty(user_id, person_id)}


def _memory_or_empty(user_id: str, person_id: int) -> dict:
    """Key dates, remembered details and family links - empty (not an
    error) until schema.sql section 31 has been applied."""
    try:
        return graph.person_memory(user_id, person_id)
    except Exception:
        return {"facts": [], "history": [], "key_dates": [], "relationships": []}


@router.post("/{person_id}/key_dates")
def add_key_date(person_id: int, body: KeyDateCreate, user_id: str = Depends(get_current_user_id)):
    db.get_person(user_id, person_id)  # 404-ish if it isn't theirs
    row = graph.add_manual_key_date(user_id, person_id, body.model_dump(exclude_none=True))
    if row is None:
        raise HTTPException(422, "That isn't a valid date - give a month and day (e.g. 14 March) or a phrase like 'tomorrow'.")
    return _memory_or_empty(user_id, person_id)


@router.delete("/{person_id}/key_dates/{key_date_id}")
def delete_key_date(person_id: int, key_date_id: int, user_id: str = Depends(get_current_user_id)):
    if not any(k["id"] == key_date_id for k in db.get_key_dates(user_id, person_id)):
        raise HTTPException(404, "Date not found")
    graph.remove_key_date(user_id, key_date_id)
    search_index.enqueue(user_id, "person", [person_id])
    return _memory_or_empty(user_id, person_id)


@router.post("/{person_id}/facts")
def add_person_fact(person_id: int, body: PersonFactCreate, user_id: str = Depends(get_current_user_id)):
    db.get_person(user_id, person_id)
    subject, subject_name = memory_schema.clean_subject(body.subject, body.subject_name)
    graph.add_manual_fact(user_id, person_id, memory_schema.normalise_attribute(body.attribute), body.value,
                          subject, subject_name)
    return _memory_or_empty(user_id, person_id)


@router.delete("/{person_id}/facts/{fact_id}")
def delete_person_fact(person_id: int, fact_id: int, user_id: str = Depends(get_current_user_id)):
    if not any(f["id"] == fact_id for f in db.get_person_facts(user_id, person_id)):
        raise HTTPException(404, "Detail not found")
    graph.remove_fact(user_id, fact_id)
    search_index.enqueue(user_id, "person", [person_id])
    return _memory_or_empty(user_id, person_id)


@router.patch("/{person_id}")
def update_person(person_id: int, body: PersonUpdate, user_id: str = Depends(get_current_user_id)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if fields:
        db.update_person(user_id, person_id, **fields)
        graph.on_person_edit(user_id, person_id, fields)
        # Their name/role/company also appears in their notes' and tasks' index text.
        search_index.enqueue(user_id, "person", [person_id])
        search_index.enqueue(user_id, "note", [i["id"] for i in db.get_interactions_for_person(user_id, person_id)])
    return db.get_person(user_id, person_id)


@router.delete("/{person_id}")
def delete_person(person_id: int, user_id: str = Depends(get_current_user_id)):
    db.delete_person(user_id, person_id)
    graph.forget(user_id, "person", person_id)
    search_index.enqueue(user_id, "person", [], prune_after=True)  # cascaded notes/tasks drop out too
    return {"ok": True}


@router.post("/{person_id}/merge")
def merge_person(person_id: int, body: MergeRequest, user_id: str = Depends(get_current_user_id)):
    # Facts and dates reference the person by foreign key and would be deleted
    # with the merged-away row, so they move to the target FIRST.
    graph.repoint(user_id, person_id, body.target_id)
    new_id = db.merge_persons(user_id, person_id, body.target_id)
    search_index.enqueue(user_id, "person", [new_id])
    search_index.enqueue(user_id, "note", [i["id"] for i in db.get_interactions_for_person(user_id, new_id)],
                         prune_after=True)
    search_index.enqueue(user_id, "task", [t["id"] for t in db.get_tasks_for_person(user_id, new_id)])
    return {"person_id": new_id}


@router.get("/{person_id}/briefing")
def get_briefing(person_id: int, user_id: str = Depends(get_current_user_id)):
    return {"briefing": retrieval.generate_briefing(user_id, person_id)}


@router.post("/{person_id}/personal_notes")
def add_personal_note(person_id: int, body: AddPersonalNoteRequest, user_id: str = Depends(get_current_user_id)):
    entry_date = body.date or date.today().isoformat()
    db.update_person_personal_notes(user_id, person_id, body.note, entry_date)
    search_index.enqueue(user_id, "person", [person_id])
    return db.get_person(user_id, person_id)


@router.delete("/{person_id}/personal_notes/{entry_index}")
def delete_personal_note(person_id: int, entry_index: int, user_id: str = Depends(get_current_user_id)):
    db.delete_person_personal_note(user_id, person_id, entry_index)
    search_index.enqueue(user_id, "person", [person_id])
    return db.get_person(user_id, person_id)


@router.patch("/interactions/{interaction_id}")
def update_interaction(interaction_id: int, body: InteractionUpdate, user_id: str = Depends(get_current_user_id)):
    # exclude_unset (not "is not None") so a field explicitly sent as null
    # - like initiative_id, to uncategorize a note back to "Uncategorized"
    # - is distinguishable from a field the client simply didn't include.
    fields = body.model_dump(exclude_unset=True)
    if fields.get("raw_text"):
        # The note's own embedding (legacy Ask path) used to keep matching the OLD text.
        fields["embedding"] = embeddings.compute_embedding(fields["raw_text"])
    if fields:
        db.update_interaction(user_id, interaction_id, **fields)
        search_index.enqueue(user_id, "note", [interaction_id])
        search_index.enqueue(user_id, "task", [t["id"] for t in db.get_tasks_for_interactions(user_id, [interaction_id])])
    return {"ok": True}


@router.delete("/interactions/{interaction_id}")
def delete_interaction(interaction_id: int, user_id: str = Depends(get_current_user_id)):
    db.delete_interaction(user_id, interaction_id)
    search_index.enqueue(user_id, "note", [], prune_after=True)
    return {"ok": True}
