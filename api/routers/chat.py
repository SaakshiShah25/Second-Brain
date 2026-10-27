"""
api/routers/chat.py — Unified chat endpoint: one message thread instead of
separate "Log a note" / "Ask a question" tabs. Every message passes
through two gates before reaching capture / the retrieval agent:

  1. moderation.py - a dedicated safety check. Blocks abusive/illegal/
     harmful content outright, before it can be logged as a "note" or
     answered as a "question" - safety is checked first and separately
     from scope, since a harmful request phrased as a first-person
     statement needs to be caught the same as one phrased as a question.
  2. intent.py - classifies what's left as "capture" (a note or to-do to
     log), "ask" (a question about the user's own notes/tasks), or
     "out_of_scope" (a general-purpose request this product isn't built
     to handle - a joke, a story, code, trivia). Only capture/ask reach
     the existing capture / agent code - this file is only a routing
     layer in front, none of the underlying extraction/retrieval logic is
     duplicated or changed.
"""

import asyncio
import json
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from groq import RateLimitError
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

import agent
import intent
import llm_budget
import observability
import moderation
from timing import step
from api.auth import get_current_user_id
from api.rate_limit import limiter
from api.routers import ask as ask_router
from api.routers import capture as capture_router
from api.schemas import AskRequest, ChatRequest

router = APIRouter()

_OUT_OF_SCOPE_MESSAGE = (
    "That's not something I can help with here - I'm built specifically for logging and "
    "recalling your own notes and tasks. Try jotting something down, or ask about something "
    "you've already logged."
)


def _blocked_reply(moderation_result: dict) -> dict:
    """The reply for a message the safety check refused. Two different cases: it
    was judged unsafe, or the check itself could not run (rate limit / outage) -
    in which case nothing is saved or answered and the user is asked to retry."""
    unavailable = bool(moderation_result.get("unavailable"))
    return {"intent": "blocked", "status": "answered", "reason": "unavailable" if unavailable else "unsafe",
            "answer": moderation.refusal(moderation_result)}


@router.post("")
@limiter.limit("20/minute")
async def chat(body: ChatRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    t_start = time.perf_counter()
    with step("moderation"):
        moderation_result = await run_in_threadpool(moderation.check, body.text)
    if not moderation_result["safe"]:
        return _blocked_reply(moderation_result)

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
            result = await capture_router._capture_text_core(user_id, body.text, body.geo_lat, body.geo_lng, request,
                                                             initiative_id=body.initiative_id)
        print(f"[timing] chat_total: {time.perf_counter() - t_start:.2f}s")
        return {"intent": "capture", **result}

    with step("ask_total"):
        try:
            result = await run_in_threadpool(_answer_question, user_id, body)
        except RateLimitError:
            raise HTTPException(429, llm_budget.BUSY_MESSAGE)
    print(f"[timing] chat_total: {time.perf_counter() - t_start:.2f}s")
    return {"intent": "ask", **result}


def _answer_question(user_id: str, body: ChatRequest, on_stage=None) -> dict:
    """Questions go to the retrieval agent (agent.py); if it fails for any
    reason (rate limit, provider hiccup, missing search index) the previous
    fixed pipeline answers instead - a question always gets an answer.
    _ask_core, not the ask() route: moderation already ran on this text."""
    ask_router._enforce(user_id, "ai_questions_asked")
    try:
        with step("agent"):
            return agent.run(user_id, body.text, body.history, on_stage)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[warn] retrieval agent failed, using fixed pipeline: {e}")
        if on_stage:
            on_stage("thinking")
        return ask_router._ask_core(user_id, AskRequest(query=body.text, history=body.history), enforce=False)


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _run_chat_pipeline(body: ChatRequest, request: Request, user_id: str, queue: "asyncio.Queue") -> None:
    """Does the exact same work as chat() above, but pushes a ("stage", name)
    onto `queue` before each major step instead of returning once at the
    end - run as a background task by chat_stream() below, concurrently
    with that endpoint's loop draining the queue, so stage events reach the
    client as they happen rather than all at once after the fact. Always
    finishes by pushing exactly one ("result", ...) or ("error", ...)."""
    stage = {"name": "moderating"}  # the step in progress - an error message says where it broke

    async def push_stage(name: str) -> None:
        stage["name"] = name
        await queue.put(("stage", name))

    try:
        await push_stage("moderating")
        moderation_result = await run_in_threadpool(moderation.check, body.text)
        if not moderation_result["safe"]:
            await queue.put(("result", _blocked_reply(moderation_result)))
            return

        await push_stage("classifying")
        detected = await run_in_threadpool(intent.classify, body.text)

        if detected == "out_of_scope":
            await queue.put((
                "result",
                {"intent": "blocked", "status": "answered", "reason": "out_of_scope", "answer": _OUT_OF_SCOPE_MESSAGE},
            ))
            return

        if detected == "capture":
            on_stage = push_stage

            result = await capture_router._capture_text_core(
                user_id, body.text, body.geo_lat, body.geo_lng, request, on_stage=on_stage,
                initiative_id=body.initiative_id,
            )
            await queue.put(("result", {"intent": "capture", **result}))
            return

        await push_stage("thinking")
        loop = asyncio.get_running_loop()

        def on_stage(name: str) -> None:  # called from the agent's worker thread
            stage["name"] = name
            loop.call_soon_threadsafe(queue.put_nowait, ("stage", name))

        result = await run_in_threadpool(_answer_question, user_id, body, on_stage)
        await queue.put(("result", {"intent": "ask", **result}))
    except HTTPException as e:
        if e.status_code >= 500 and e.status_code != 503:
            await queue.put(("error", _failure(stage["name"], e, str(e.detail), e.status_code)))
        else:
            if e.status_code in (429, 503):
                observability.record("limit", "ai_unavailable", status=e.status_code, detail={"stage": stage["name"]})
            await queue.put(("error", {"detail": e.detail, "status_code": e.status_code}))
    except RateLimitError:
        observability.record("limit", "ai_unavailable", status=429, detail={"stage": stage["name"]})
        await queue.put(("error", {"detail": llm_budget.BUSY_MESSAGE, "status_code": 429}))
    except Exception as e:
        await queue.put(("error", _failure(stage["name"], e, None, 500)))


# Where a chat request was when it failed, in the user's words.
_STAGE_WHERE = {
    "moderating": "checking your message",
    "classifying": "working out what your message is",
    "extracting": "reading your note",
    "saving": "saving your note",
    "thinking": "looking through your notes",
    "planning": "looking through your notes",
    "searching": "searching your notes",
    "reading_notes": "reading the relevant notes",
    "checking_tasks": "checking your tasks",
    "writing": "writing the answer",
}


def _failure(stage_name: str, exc, message, status: int) -> dict:
    where = _STAGE_WHERE.get(stage_name, "processing your message")
    error_id = observability.error(f"chat: {where}", exc, message=message, status=status)
    return {
        "detail": f"Something went wrong while {where}. We've been alerted (reference {error_id}) - "
                  "your text is back in the box if you want to try again.",
        "status_code": status,
        "error_id": error_id,
    }


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
