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
import person_match
import retrieval
from api.auth import get_current_user_id
from api.schemas import AskConfirmRequest, AskRequest

router = APIRouter()


def _proceed_with_retrieval(user_id: str, query: str, parsed: dict, person: Optional[dict]) -> str:
    if person:
        interactions = retrieval.get_all_interactions_for_person(user_id, person["id"])
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
        return ("I couldn't resolve a specific person from your question, and "
                "semantic search isn't available right now.")
    matches = db.search_interactions_by_embedding(user_id, query_embedding, top_k=5)
    if not matches:
        return "I couldn't find anything matching that."
    selected = db.get_interactions_by_ids(user_id, [m["id"] for m in matches])
    selected = retrieval.attach_tasks(user_id, selected)
    return retrieval.synthesize_answer(query, selected, None)


@router.post("")
def ask(body: AskRequest, user_id: str = Depends(get_current_user_id)):
    conversation_context = retrieval.format_recent_context(body.history)
    try:
        parsed = retrieval.parse_query(body.query, conversation_context=conversation_context)
    except Exception as e:
        raise HTTPException(500, f"Couldn't understand that question: {e}")

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
