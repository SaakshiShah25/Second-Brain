"""
api/routers/ask.py — The fixed (non-agent) way to answer a question: embed
it, find the closest notes, hand them (with their tasks) to the LLM. The
chat endpoint normally answers through the retrieval agent (agent.py) and
falls back to this when the agent can't run; POST /api/ask is also a plain
endpoint of its own. See retrieval.py.
"""

from fastapi import APIRouter, Depends, HTTPException

import db
import embeddings
import entitlements
import moderation
import retrieval
import search_index
from api.auth import get_current_user_id
from api.schemas import AskRequest

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


def _answer(user_id: str, query: str) -> str:
    query_embedding = embeddings.compute_embedding(query, input_type="search_query")
    if query_embedding is None:
        # The embedding service (Cohere) could not be reached or is rate limited, so
        # "search by meaning" is out for this question. Words still work: the search
        # index scores by keywords on its own when it has no vector.
        try:
            hits = search_index.search(user_id, query, kinds=["note"], k=5)
        except Exception:
            hits = []
        if not hits:
            return ("I couldn't search your notes by meaning just now - the search service didn't respond "
                    "(it may be rate limited), and a word search found nothing. Please try again in a minute.")
        selected = db.get_interactions_by_ids(user_id, [h["entity_id"] for h in hits])
    else:
        matches = db.search_interactions_by_embedding(user_id, query_embedding, top_k=5)
        if not matches:
            return "I couldn't find anything matching that."
        selected = db.get_interactions_by_ids(user_id, [m["id"] for m in matches])
    return retrieval.synthesize_answer(query, retrieval.attach_tasks(user_id, selected))


def _ask_core(user_id: str, body: AskRequest, enforce: bool = True) -> dict:
    """The actual ask logic, factored out of ask() below so
    api/routers/chat.py can call this directly after ITS OWN
    moderation.check() without paying for a second Groq call here too.
    See capture.py's _capture_text_core docstring for why this can't
    just be a bool kwarg on the route function instead."""
    if enforce:  # chat.py's agent path already counted this question
        _enforce(user_id, "ai_questions_asked")
    try:
        answer = _answer(user_id, body.query)
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
