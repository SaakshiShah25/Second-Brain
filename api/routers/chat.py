"""
api/routers/chat.py — Unified chat endpoint: one message thread instead of
separate "Log a note" / "Ask a question" tabs. Every message passes
through two gates before reaching capture.py/ask.py:

  1. moderation.py - a dedicated Llama Guard safety check. Blocks abusive/
     illegal/harmful content outright, before it can be logged as a "note"
     or answered as a "question" - safety is checked first and separately
     from scope, since a harmful request phrased as a first-person
     statement needs to be caught the same as one phrased as a question.
  2. intent.py - classifies what's left as "capture" (a note to log),
     "ask" (a question about the user's own data), or "out_of_scope" (a
     general-purpose request this product isn't built to handle - a joke,
     a story, code, trivia). Only capture/ask reach the existing
     capture.py/ask.py route functions - this file is only a routing
     layer in front, none of the underlying extraction/retrieval logic is
     duplicated or changed.

Business-card scanning stays a separate explicit action
(POST /api/capture/card) since it's triggered by an attach/camera icon,
not typed text there's anything to classify or moderate the same way.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool

import intent
import moderation
from api.auth import get_current_user_id
from api.rate_limit import limiter
from api.routers import ask as ask_router
from api.routers import capture as capture_router
from api.schemas import (
    AskConfirmRequest,
    AskRequest,
    CaptureConfirmRequest,
    CaptureRequest,
    ChatConfirmRequest,
    ChatRequest,
)

router = APIRouter()

_OUT_OF_SCOPE_MESSAGE = (
    "I'm built specifically to help you log and recall your own notes, contacts, and "
    "follow-ups - I can't help with general requests like jokes, stories, code, or anything "
    "unrelated to that. Try telling me about a conversation you had, or ask about someone "
    "you've talked to before."
)
_UNSAFE_MESSAGE = "I can't help with that request."


@router.post("")
@limiter.limit("20/minute")
async def chat(body: ChatRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    moderation_result = await run_in_threadpool(moderation.check, body.text)
    if not moderation_result["safe"]:
        return {"intent": "blocked", "status": "answered", "reason": "unsafe", "answer": _UNSAFE_MESSAGE}

    detected = await run_in_threadpool(intent.classify, body.text)

    if detected == "out_of_scope":
        return {
            "intent": "blocked",
            "status": "answered",
            "reason": "out_of_scope",
            "answer": _OUT_OF_SCOPE_MESSAGE,
        }

    if detected == "capture":
        result = await capture_router.capture_text(
            CaptureRequest(raw_text=body.text, geo_lat=body.geo_lat, geo_lng=body.geo_lng), request, user_id,
        )
        return {"intent": "capture", **result}

    try:
        result = await run_in_threadpool(ask_router.ask, AskRequest(query=body.text, history=body.history), user_id)
    except HTTPException:
        raise
    return {"intent": "ask", **result}


@router.post("/confirm")
def chat_confirm(body: ChatConfirmRequest, user_id: str = Depends(get_current_user_id)):
    if body.intent == "capture":
        if body.extracted is None or body.raw_text is None or body.interaction_date is None:
            raise HTTPException(400, "Missing capture fields for a capture-intent confirm")
        result = capture_router.capture_confirm(
            CaptureConfirmRequest(
                extracted=body.extracted, raw_text=body.raw_text, interaction_date=body.interaction_date,
                date_warning=body.date_warning, candidates=body.candidates, choice=body.choice,
                initiative_id=body.initiative_id, geo_lat=body.geo_lat, geo_lng=body.geo_lng,
            ),
            user_id,
        )
        return {"intent": "capture", **result}

    if body.query is None or body.parsed is None:
        raise HTTPException(400, "Missing ask fields for an ask-intent confirm")
    result = ask_router.ask_confirm(
        AskConfirmRequest(query=body.query, parsed=body.parsed, candidates=body.candidates, choice=body.choice),
        user_id,
    )
    return {"intent": "ask", **result}
