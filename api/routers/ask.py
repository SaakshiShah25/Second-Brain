"""
api/routers/ask.py — REST equivalent of views/chat_view.py's retrieval
side, reusing the exact same building blocks (retrieval.py's
parse_query/select_by_scope/attach_tasks/synthesize_answer/
format_recent_context, person_match.py, embeddings.py) that
chat_view.py's handle_retrieval()/proceed_with_retrieval() already
compose. See api/schemas.py's module docstring for how the person-
disambiguation "confirm" step avoids needing server-side session state.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

import db
import embeddings
import entitlements
import moderation
import person_match
import retrieval
import search_index
from api.auth import get_current_user_id
from api.schemas import AskConfirmRequest, AskRequest

router = APIRouter()


def _enforce(user_id: str, resource: str):
    """Same free-tier gate as api/routers/capture.py's _enforce() - kept
    as its own copy rather than a shared import, since the two files'
    only common dependency should stay entitlements.py itself, not each
    other. See capture.py's version for the full rationale."""
    try:
        entitlements.check_and_increment(user_id, resource)
    except entitlements.LimitExceeded as e:
        raise HTTPException(
            402,
            f"You've reached this month's free plan limit ({e.limit}/month) for this - it resets next month, "
            "or upgrade to Premium for unlimited use.",
        )


def _proceed_with_retrieval(user_id: str, query: str, parsed: dict, person: Optional[dict]) -> str:
    if person:
        # What the memory layer holds (birthday, likes, family) travels with
        # the person, so it answers even when there are no notes about them.
        person = {**person, "memory_text": retrieval.person_memory_text(user_id, person["id"])}
        interactions = retrieval.get_all_interactions_for_person(user_id, person["id"])
        if not interactions and person["memory_text"]:
            return retrieval.synthesize_answer(query, [], person)
        if not interactions:
            return f"I don't have any interactions recorded for {person['name']} yet."
        selected = retrieval.select_by_scope(
            interactions, parsed.get("scope", "all"), parsed.get("specific_date"), parsed.get("count")
        )
        selected = retrieval.attach_tasks(user_id, selected)
        return retrieval.synthesize_answer(query, selected, person)

    semantic_query = parsed.get("semantic_query") or query
    query_embedding = embeddings.compute_embedding(semantic_query, input_type="search_query")
    if query_embedding is None:
        # The embedding service (Cohere) could not be reached or is rate limited, so
        # "search by meaning" is out for this question. Words still work: the search
        # index scores by keywords on its own when it has no vector.
        try:
            hits = search_index.search(user_id, semantic_query, kinds=["note"], k=5)
        except Exception:
            hits = []
        if not hits:
            return ("I couldn't search your notes by meaning just now - the search service didn't respond "
                    "(it may be rate limited), and a word search found nothing. Please try again in a minute.")
        selected = db.get_interactions_by_ids(user_id, [h["entity_id"] for h in hits])
        selected = retrieval.attach_tasks(user_id, selected)
        return retrieval.synthesize_answer(query, selected, None)
    matches = db.search_interactions_by_embedding(user_id, query_embedding, top_k=5)
    if not matches:
        return "I couldn't find anything matching that."
    selected = db.get_interactions_by_ids(user_id, [m["id"] for m in matches])
    selected = retrieval.attach_tasks(user_id, selected)
    return retrieval.synthesize_answer(query, selected, None)


def _ask_core(user_id: str, body: AskRequest, enforce: bool = True) -> dict:
    """The actual ask logic, factored out of ask() below for the same
    reason capture.py splits capture_text/_capture_text_core: so
    api/routers/chat.py can call this directly after ITS OWN
    moderation.check() without paying for a second Groq call here too.
    See capture.py's _capture_text_core docstring for why this can't
    just be a bool kwarg on the route function instead."""
    if enforce:  # chat.py's agent path already counted this question
        _enforce(user_id, "ai_questions_asked")
    conversation_context = retrieval.format_recent_context(body.history)
    try:
        parsed = retrieval.parse_query(body.query, conversation_context=conversation_context)
    except Exception as e:
        raise HTTPException(500, f"Couldn't understand that question: {e}")

    if parsed.get("aggregate"):
        return {"status": "answered", "answer": retrieval.answer_aggregate_query(user_id, parsed["aggregate"])}

    person = None
    if parsed.get("person_name"):
        people = db.get_all_people(user_id)
        candidates = person_match.score_candidates(parsed["person_name"], people)
        if len(candidates) == 1:
            person = candidates[0][0]
        elif len(candidates) > 1:
            return {
                "status": "confirm_required",
                "query": body.query,
                "parsed": parsed,
                "candidates": [{"person": p, "score": s} for p, s in candidates],
            }

    try:
        answer = _proceed_with_retrieval(user_id, body.query, parsed, person)
    except Exception as e:
        raise HTTPException(500, f"Something went wrong while looking that up: {e}")
    return {"status": "answered", "answer": answer}


@router.post("")
def ask(body: AskRequest, user_id: str = Depends(get_current_user_id)):
    # Only this route's own moderation check - api/routers/chat.py calls
    # _ask_core directly and has already run its own before getting here.
    result = moderation.check(body.query)
    if not result["safe"]:
        if result.get("unavailable"):
            raise HTTPException(503, moderation.UNAVAILABLE_MESSAGE)
        raise HTTPException(400, "I can't help with that request.")
    return _ask_core(user_id, body)


@router.post("/confirm")
def ask_confirm(body: AskConfirmRequest, user_id: str = Depends(get_current_user_id)):
    person = None
    if body.choice is not None:
        if body.choice < 0 or body.choice >= len(body.candidates):
            raise HTTPException(400, "choice out of range")
        person = body.candidates[body.choice].person

    try:
        answer = _proceed_with_retrieval(user_id, body.query, body.parsed, person)
    except Exception as e:
        raise HTTPException(500, f"Something went wrong while looking that up: {e}")
    return {"status": "answered", "answer": answer}
