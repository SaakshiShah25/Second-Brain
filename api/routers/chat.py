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

Business-card scanning stays a separate explicit action (POST
/api/capture/card), triggered by an attach/camera icon rather than typed
text to classify - it has no intent to classify (a scanned card is
always a capture), but it still goes through moderation.py itself,
directly in api/routers/capture.py, since the same safety gate has to
apply no matter which entry point text/OCR'd text comes in through.
"""

import asyncio
import json
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

import intent
import moderation
from timing import step
from api.auth import get_current_user_id
from api.rate_limit import limiter
from api.routers import ask as ask_router
from api.routers import capture as capture_router
from api.schemas import (
    AskConfirmRequest,
    AskRequest,
    CaptureConfirmRequest,
    ChatConfirmRequest,
    ChatRequest,
)

router = APIRouter()

_OUT_OF_SCOPE_MESSAGE = (
    "That's not something I can help with here - I'm built specifically for logging and "
    "recalling your own notes, contacts, and follow-ups. Try telling me about a conversation "
    "you had, or ask about someone you've talked to before."
)
_UNSAFE_MESSAGE = "I can't help with that request."


@router.post("")
@limiter.limit("20/minute")
async def chat(body: ChatRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    t_start = time.perf_counter()
    with step("moderation"):
        moderation_result = await run_in_threadpool(moderation.check, body.text)
    if not moderation_result["safe"]:
        return {"intent": "blocked", "status": "answered", "reason": "unsafe", "answer": _UNSAFE_MESSAGE}

    with step("intent_classify"):
        detected = await run_in_threadpool(intent.classify, body.text)

    if detected == "out_of_scope":
        print(f"[timing] chat_total: {time.perf_counter() - t_start:.2f}s")
        return {
            "intent": "blocked",
            "status": "answered",
            "reason": "out_of_scope",
            "answer": _OUT_OF_SCOPE_MESSAGE,
        }

    if detected == "capture":
        # Calls the core function directly, not the capture_text ROUTE -
        # we already ran moderation.check() above for this exact text;
        # going through the route would run it again for no benefit. See
        # _capture_text_core's own docstring for why this can't just be a
        # bool kwarg on the route function instead.
        with step("capture_total"):
            result = await capture_router._capture_text_core(user_id, body.text, body.geo_lat, body.geo_lng, request)
        print(f"[timing] chat_total: {time.perf_counter() - t_start:.2f}s")
        return {"intent": "capture", **result}

    # _ask_core, not the ask() route - same reasoning as the capture
    # branch above: moderation already ran on this exact text.
    try:
        with step("ask_total"):
            result = await run_in_threadpool(
                ask_router._ask_core, user_id, AskRequest(query=body.text, history=body.history)
            )
    except HTTPException:
        raise
    print(f"[timing] chat_total: {time.perf_counter() - t_start:.2f}s")
    return {"intent": "ask", **result}


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _run_chat_pipeline(body: ChatRequest, request: Request, user_id: str, queue: "asyncio.Queue") -> None:
    """Does the exact same work as chat() above, but pushes a ("stage", name)
    onto `queue` before each major step instead of returning once at the
    end - run as a background task by chat_stream() below, concurrently
    with that endpoint's loop draining the queue, so stage events reach the
    client as they happen rather than all at once after the fact. Always
    finishes by pushing exactly one ("result", ...) or ("error", ...)."""
    try:
        await queue.put(("stage", "moderating"))
        moderation_result = await run_in_threadpool(moderation.check, body.text)
        if not moderation_result["safe"]:
            await queue.put(("result", {"intent": "blocked", "status": "answered", "reason": "unsafe", "answer": _UNSAFE_MESSAGE}))
            return

        await queue.put(("stage", "classifying"))
        detected = await run_in_threadpool(intent.classify, body.text)

        if detected == "out_of_scope":
            await queue.put((
                "result",
                {"intent": "blocked", "status": "answered", "reason": "out_of_scope", "answer": _OUT_OF_SCOPE_MESSAGE},
            ))
            return

        if detected == "capture":
            async def on_stage(stage: str) -> None:
                await queue.put(("stage", stage))

            result = await capture_router._capture_text_core(
                user_id, body.text, body.geo_lat, body.geo_lng, request, on_stage=on_stage
            )
            await queue.put(("result", {"intent": "capture", **result}))
            return

        await queue.put(("stage", "thinking"))
        result = await run_in_threadpool(
            ask_router._ask_core, user_id, AskRequest(query=body.text, history=body.history)
        )
        await queue.put(("result", {"intent": "ask", **result}))
    except HTTPException as e:
        await queue.put(("error", {"detail": e.detail, "status_code": e.status_code}))
    except Exception as e:
        await queue.put(("error", {"detail": str(e), "status_code": 500}))


async def _chat_stream_body(body: ChatRequest, request: Request, user_id: str):
    queue: asyncio.Queue = asyncio.Queue()
    task = asyncio.create_task(_run_chat_pipeline(body, request, user_id, queue))
    try:
        while True:
            kind, payload = await queue.get()
            yield _sse(kind, payload)
            if kind in ("result", "error"):
                break
    finally:
        # The client navigating away or hitting Stop closes the response
        # stream from fastapi's side - without this, the background task
        # above would keep running (and keep spending Groq/Gemini tokens)
        # for a request nobody's listening to anymore.
        if not task.done():
            task.cancel()


@router.post("/stream")
@limiter.limit("20/minute")
async def chat_stream(body: ChatRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    """Server-Sent Events version of chat() above, for the frontend's main
    send path - same moderation -> intent -> capture/ask logic (actually
    runs through it, via _run_chat_pipeline, not a reimplementation), but
    emits a `stage` event before each major step so the UI can show live
    progress ("Extracting the details...", "Saving...") instead of a bare
    spinner for however long extraction happens to take. Ends with exactly
    one `result` event (the same JSON body chat() would have returned) or
    one `error` event. chat() itself stays as-is for any other caller."""
    return StreamingResponse(
        _chat_stream_body(body, request, user_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
