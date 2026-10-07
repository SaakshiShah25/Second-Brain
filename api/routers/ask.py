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


def _answered(answer: str, sources: Optional[list] = None, total: int = 0) -> dict:
    """The one shape every successful ask returns. `sources` (the notes
    the answer was actually drawn from) is omitted entirely when there are
    none, so the UI can simply not render a sources section."""
    out = {"status": "answered", "answer": answer}
    if sources:
        out["sources"] = sources
        out["sources_total"] = total
    return out


def _proceed_with_retrieval(user_id: str, query: str, parsed: dict, person: Optional[dict]) -> dict:
    date_range = retrieval.range_from_parsed(parsed)
    range_label = retrieval.describe_range(parsed, date_range) if date_range else ""
    # The parser named a time window but it wasn't one of the shapes
    # date_utils.resolve_date_range understands - say so up front instead
    # of silently answering as if no window had been asked for.
    unparsed_window = parsed.get("date_range") if parsed.get("date_range") and not date_range else None

    result = _retrieve(user_id, query, parsed, person, date_range, range_label)
    if unparsed_window and result.get("status") == "answered":
        result["answer"] = (
            f"_I couldn't work out the time period \"{unparsed_window}\", so I looked across all your notes._"
            f"\n\n{result['answer']}"
        )
    return result


def _retrieve(user_id: str, query: str, parsed: dict, person: Optional[dict], date_range, range_label: str) -> dict:
    count_by = parsed.get("count_by")
    if count_by not in retrieval.COUNT_BY_VALUES:
        count_by = None

    if count_by:
        # A name was said but matched nobody - a count over EVERYONE would
        # quietly answer a different question than the one asked.
        if parsed.get("person_name") and not person:
            return _answered(f"I don't have anyone named {parsed['person_name']} in your contacts yet.")
        answer, sources, total = retrieval.answer_count_query(user_id, count_by, person, date_range, range_label)
        return _answered(answer, sources, total)

    people_by_id = {p["id"]: p for p in db.get_all_people(user_id)}

    if person:
        interactions = retrieval.get_all_interactions_for_person(user_id, person["id"])
        if not interactions:
            return _answered(f"I don't have any interactions recorded for {person['name']} yet.")
        selected = retrieval.select_by_scope(
            interactions, parsed.get("scope", "all"), parsed.get("specific_date"), parsed.get("count"),
            date_range,
        )
        if not selected:
            return _answered(f"I don't see any interactions with {person['name']} {range_label}.")
        selected = retrieval.attach_tasks(user_id, selected)
        sources, total = retrieval.build_sources(selected, people_by_id)
        return _answered(retrieval.synthesize_answer(query, selected, person), sources, total)

    if date_range:
        # A time-window question with no one named ("who did I meet last
        # month", "what happened in July") is membership in a date range -
        # an exact filter, not a similarity search, which is why embeddings
        # alone could never answer it reliably.
        rows, all_rows = retrieval.interactions_in_range(user_id, date_range)
        if not rows:
            return _answered(f"I don't see any notes {range_label}.")
        names = sorted(
            {people_by_id[i["person_id"]]["name"] for i in all_rows if i.get("person_id") in people_by_id},
            key=str.lower,
        )
        facts = f"{len(all_rows)} note(s) {range_label}"
        if names:
            facts += f", involving {len(names)} different people ({', '.join(names[:15])})"
        facts += "."
        if len(all_rows) > len(rows):
            facts += f" Only the {len(rows)} most recent notes are included below."
        selected = retrieval.attach_tasks(user_id, rows)
        selected = retrieval.attach_person_names(user_id, selected, people_by_id)
        sources, total = retrieval.build_sources(selected, people_by_id)
        return _answered(retrieval.synthesize_answer(query, selected, None, facts), sources, total)

    semantic_query = parsed.get("semantic_query") or query
    query_embedding = embeddings.compute_embedding(semantic_query, input_type="search_query")
    if query_embedding is None:
        return _answered("I couldn't resolve a specific person from your question, and "
                         "semantic search isn't available right now.")
    matches = db.search_interactions_by_embedding(user_id, query_embedding, top_k=5)
    if not matches:
        # "Nothing matched THIS question" and "there's nothing logged at
        # all yet" read as the same generic non-answer otherwise - the
        # second one is a brand-new account's very first question, and
        # deserves pointing them at what to do next rather than a bare
        # search-miss message that implies they have notes this just
        # didn't find.
        if not db.get_all_interactions(user_id):
            return _answered(retrieval.NO_NOTES_MESSAGE)
        return _answered("I couldn't find anything matching that in your notes.")
    selected = db.get_interactions_by_ids(user_id, [m["id"] for m in matches])
    selected = retrieval.attach_tasks(user_id, selected)
    selected = retrieval.attach_person_names(user_id, selected, people_by_id)
    sources, total = retrieval.build_sources(selected, people_by_id)
    return _answered(retrieval.synthesize_answer(query, selected, None), sources, total)


def _ask_core(user_id: str, body: AskRequest) -> dict:
    """The actual ask logic, factored out of ask() below for the same
    reason capture.py splits capture_text/_capture_text_core: so
    api/routers/chat.py can call this directly after ITS OWN
    moderation.check() without paying for a second Groq call here too.
    See capture.py's _capture_text_core docstring for why this can't
    just be a bool kwarg on the route function instead."""
    _enforce(user_id, "ai_questions_asked")
    conversation_context = retrieval.format_recent_context(body.history)
    try:
        parsed = retrieval.parse_query(body.query, conversation_context=conversation_context)
    except Exception as e:
        raise HTTPException(500, f"Couldn't understand that question: {e}")

    if parsed.get("aggregate"):
        agg_range = retrieval.range_from_parsed(parsed)
        agg_label = retrieval.describe_range(parsed, agg_range) if agg_range else ""
        return _answered(retrieval.answer_aggregate_query(user_id, parsed["aggregate"], agg_range, agg_label))

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
        return _proceed_with_retrieval(user_id, body.query, parsed, person)
    except Exception as e:
        raise HTTPException(500, f"Something went wrong while looking that up: {e}")


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
        return _proceed_with_retrieval(user_id, body.query, body.parsed, person)
    except Exception as e:
        raise HTTPException(500, f"Something went wrong while looking that up: {e}")
