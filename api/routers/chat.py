"""
api/routers/chat.py — Unified chat endpoint: one message thread instead of
separate "Log a note" / "Ask a question" tabs. Classifies each message's
intent (capture vs ask) via intent.py, then delegates to the exact same
capture.py/ask.py route functions those already exposed separately - this
is only a routing layer in front, none of the underlying extraction/
retrieval logic is duplicated or changed. Business-card scanning stays a
separate explicit action (POST /api/capture/card) since it's triggered by
an attach/camera icon, not typed text there's anything to classify.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool

import intent
from api.auth import get_current_user_id
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


@router.post("")
async def chat(body: ChatRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    detected = await run_in_threadpool(intent.classify, body.text)

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
