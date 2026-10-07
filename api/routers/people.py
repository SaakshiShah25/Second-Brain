"""
api/routers/people.py — REST equivalent of views/people_view.py (browse/
edit/merge a person, edit/delete an interaction, get a briefing), plus
the "relationships gone quiet" half of views/digest_view.py (belongs
here since it's fundamentally a /people query, not a /tasks one).
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException

import db
import important_dates
import retrieval
from api.auth import get_current_user_id
from api.schemas import AddPersonalNoteRequest, InteractionUpdate, MergeRequest, PersonUpdate

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


@router.get("/upcoming-dates")
def upcoming_dates(days: int = 30, user_id: str = Depends(get_current_user_id)):
    """Birthdays/anniversaries (person.important_dates) falling within the
    next `days` days, soonest first - what the Today page's "Coming up"
    card shows."""
    days = max(1, min(days, 365))
    return important_dates.upcoming(db.get_all_people(user_id), within_days=days)


@router.get("/companies")
def list_companies(user_id: str = Depends(get_current_user_id)):
    """Groups people by their `company` field (case-sensitive grouping key
    here, purely for display - db.get_people_by_company() does the actual
    case-insensitive lookup when a briefing is requested for one)."""
    people = db.get_all_people(user_id)
    grouped: dict[str, list] = {}
    for p in people:
        company = (p.get("company") or "").strip()
        if not company:
            continue
        grouped.setdefault(company, []).append(p)
    return [
        {
            "company": name,
            "people": [{"id": p["id"], "name": p["name"], "role": p.get("role") or ""} for p in members],
        }
        for name, members in sorted(grouped.items())
    ]


@router.get("/companies/{company}/overview")
def company_overview(company: str, user_id: str = Depends(get_current_user_id)):
    """Who you know at one company and how much you've actually talked to
    them - the deterministic half of a company view (the AI briefing is the
    other half, and stays a separate on-demand call). Plain counts and
    dates straight from the data, no LLM: every number here is exact."""
    people = db.get_people_by_company(user_id, company)
    if not people:
        raise HTTPException(404, "You don't have any contacts at that company.")
    by_id = {p["id"]: p for p in people}
    interactions = [i for i in db.get_all_interactions(user_id) if i.get("person_id") in by_id]
    interactions.sort(key=lambda i: (i.get("date") or "", i.get("created_at") or ""), reverse=True)

    per_person: dict = {pid: {"count": 0, "last": None} for pid in by_id}
    for i in interactions:
        stats = per_person[i["person_id"]]
        stats["count"] += 1
        if i.get("date") and (stats["last"] is None or i["date"] > stats["last"]):
            stats["last"] = i["date"]

    dates = [i["date"] for i in interactions if i.get("date")]
    return {
        "company": people[0].get("company") or company,
        "people": sorted(
            (
                {
                    "id": p["id"],
                    "name": p["name"],
                    "role": p.get("role") or "",
                    "interaction_count": per_person[p["id"]]["count"],
                    "last_interaction_date": per_person[p["id"]]["last"],
                }
                for p in people
            ),
            key=lambda p: (p["last_interaction_date"] or "", p["name"].lower()),
            reverse=True,
        ),
        "interaction_count": len(interactions),
        "first_interaction_date": min(dates) if dates else None,
        "last_interaction_date": max(dates) if dates else None,
        "recent_interactions": [
            {
                "id": i["id"],
                "date": i.get("date"),
                "summary": retrieval._trim(i.get("summary") or i.get("raw_text") or "", 160),
                "person": {"id": i["person_id"], "name": by_id[i["person_id"]]["name"]},
            }
            for i in interactions[:10]
        ],
    }


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
    return {"person": person, "interactions": interactions, "mentioned_in": secondary}


@router.patch("/{person_id}")
def update_person(person_id: int, body: PersonUpdate, user_id: str = Depends(get_current_user_id)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if fields:
        db.update_person(user_id, person_id, **fields)
    return db.get_person(user_id, person_id)


@router.delete("/{person_id}")
def delete_person(person_id: int, user_id: str = Depends(get_current_user_id)):
    db.delete_person(user_id, person_id)
    return {"ok": True}


@router.post("/{person_id}/merge")
def merge_person(person_id: int, body: MergeRequest, user_id: str = Depends(get_current_user_id)):
    new_id = db.merge_persons(user_id, person_id, body.target_id)
    return {"person_id": new_id}


@router.get("/{person_id}/briefing")
def get_briefing(person_id: int, user_id: str = Depends(get_current_user_id)):
    return {"briefing": retrieval.generate_briefing(user_id, person_id)}


@router.post("/{person_id}/personal_notes")
def add_personal_note(person_id: int, body: AddPersonalNoteRequest, user_id: str = Depends(get_current_user_id)):
    entry_date = body.date or date.today().isoformat()
    db.update_person_personal_notes(user_id, person_id, body.note, entry_date)
    return db.get_person(user_id, person_id)


@router.delete("/{person_id}/personal_notes/{entry_index}")
def delete_personal_note(person_id: int, entry_index: int, user_id: str = Depends(get_current_user_id)):
    db.delete_person_personal_note(user_id, person_id, entry_index)
    return db.get_person(user_id, person_id)


@router.patch("/interactions/{interaction_id}")
def update_interaction(interaction_id: int, body: InteractionUpdate, user_id: str = Depends(get_current_user_id)):
    # exclude_unset (not "is not None") so a field explicitly sent as null
    # - like initiative_id, to uncategorize a note back to "Uncategorized"
    # - is distinguishable from a field the client simply didn't include.
    fields = body.model_dump(exclude_unset=True)
    if fields:
        db.update_interaction(user_id, interaction_id, **fields)
    return {"ok": True}


@router.delete("/interactions/{interaction_id}")
def delete_interaction(interaction_id: int, user_id: str = Depends(get_current_user_id)):
    db.delete_interaction(user_id, interaction_id)
    return {"ok": True}
