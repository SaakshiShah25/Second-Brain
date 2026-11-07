"""
api/routers/capture.py — Logging a capture: text (and voice, via transcription)
goes through extraction.py and is saved as items (to-dos, list entries,
routines, dates) and - only when there is something to remember - a note.
Everything saved is queued for the search index. `_capture_text_core` is also what
api/routers/chat.py calls for the main chat input.
"""

import time
from datetime import date
from typing import Awaitable, Callable, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from groq import RateLimitError
from starlette.concurrency import run_in_threadpool

import db
import embeddings
import entitlements
import extraction
import google_maps
import llm_budget
import moderation
import search_index
import text_utils
import voice
from timing import step
from api.auth import get_current_user_id
from api.rate_limit import limiter
from api.schemas import CaptureRequest
from date_utils import first_occurrence, normalize_repeat, resolve_relative_phrase, to_valid_time

router = APIRouter()


def _reject_if_unsafe(text: str) -> None:
    """Raises a 400 if `text` fails moderation.py's check - shared by
    every entry point that can turn free-form text into a stored note.
    api/routers/chat.py already moderates the text before it reaches
    _capture_text_core, but capture_text/capture_voice are ALSO their own
    independently-callable API routes - without this, hitting one of those
    directly would skip moderation entirely. That matters here: unlike a
    live chat answer, a saved note's raw_text later comes back as
    "trusted" retrieved context in a future answer (see agent.py), so
    letting unsafe or prompt-injection content into storage at all is a
    bigger, longer-lived risk than one unmoderated live response."""
    result = moderation.check(text)
    if not result["safe"]:
        if result.get("unavailable"):  # the check couldn't run: nothing is saved, try again
            raise HTTPException(503, moderation.UNAVAILABLE_MESSAGE)
        raise HTTPException(400, "This content can't be logged - it looks unsafe or attempts to manipulate the assistant.")


def _enforce(user_id: str, resource: str):
    """Raises a 402 with an upgrade-shaped message if this free-tier
    account has hit its monthly cap for `resource` - called right before
    the expensive step it protects (extraction/transcription), not
    after, so an over-limit account never actually triggers the LLM call
    it can't complete. Premium accounts (entitlements.get_tier) never hit
    this. 402 Payment Required, not 429, since this isn't "slow down and
    retry" (a rate limit) - it's "this needs an upgrade" (a plan limit)."""
    try:
        entitlements.check_and_increment(user_id, resource)
    except entitlements.LimitExceeded as e:
        raise HTTPException(
            402,
            f"You've reached this month's free plan limit ({e.limit}/month) for this - it resets next month, "
            "or upgrade to Premium for unlimited use.",
        )


# ---------- Shared capture tail (mirrors chat_view.py) ----------

def _resolve_interaction_date(extracted: dict):
    raw_date = extracted.get("date_mentioned")
    resolved = resolve_relative_phrase(raw_date) or date.today().isoformat()
    warning = None
    if raw_date and not resolve_relative_phrase(raw_date):
        warning = f"note: extracted date '{raw_date}' wasn't understood, used {resolved} instead"
    return resolved, warning


def _resolve_initiative(user_id: str, extracted: dict) -> Optional[int]:
    """Resolves extraction.py's classified initiative name to an
    initiative_id via an exact, case-insensitive match against this
    user's CURRENT initiatives - never creates a new one on the model's
    own initiative. Returns None (Uncategorized) if the model said null,
    or named something that doesn't match any existing initiative (stale
    list, wording mismatch, hallucination) - silent, no error, matching
    the "don't interrupt the capture flow for this" decision (a wrong/
    missing initiative is a single dropdown fix later)."""
    name = (extracted.get("initiative") or "").strip()
    if not name:
        return None
    match = db.get_initiative_by_name(user_id, name)
    return match["id"] if match else None


class _ListResolver:
    """Turns the list names the model gives into list ids for one capture, creating a list the
    first time it's needed. The main Tasks list is no list at all (None)."""

    def __init__(self, user_id: str):
        self.user_id = user_id
        self.cache: dict = {}

    def resolve(self, name) -> Optional[dict]:
        name = " ".join(str(name or "").split())[:40]
        if not name or name.lower() in text_utils.MAIN_LIST_NAMES:
            return None
        key = name.lower()
        if key not in self.cache:
            existing = db.get_list_by_name(self.user_id, name)
            self.cache[key] = existing or db.create_list(self.user_id, name[:1].upper() + name[1:],
                                                         text_utils.list_emoji(name))
        return self.cache[key]


def _parse_items(extracted: dict) -> list:
    """extraction.py's follow_ups as clean dicts; empty ones dropped."""
    items = []
    for item in extracted.get("follow_ups", []) or []:
        if not isinstance(item, dict):
            item = {"description": str(item)}
        desc = text_utils.clean_task_text(item.get("description", ""))
        if not desc:
            continue
        owner = item.get("owner") if item.get("owner") in ("me", "them") else "me"
        detail = " ".join(str(item.get("detail") or "").split())[:1000] or None
        items.append({**item, "description": desc, "owner": owner, "detail": detail})
    return items


def _finish_capture_storage(user_id: str, raw_text: str, extracted: dict, interaction_date: str,
                             date_warning: Optional[str], initiative_id: Optional[int] = None,
                             geo_lat: Optional[float] = None, geo_lng: Optional[float] = None) -> dict:
    # The summary is stored as short "- " bullet points on purpose (see extraction.py); decisions,
    # concerns and tasks are single lines, so a stray list marker at their start is dropped.
    summary = text_utils.as_bullets(extracted.get("summary", "") or "")
    decisions = [d for d in (text_utils.strip_bullet(x) for x in extracted.get("decisions") or []) if d]
    concerns = [c for c in (text_utils.strip_bullet(x) for x in extracted.get("concerns") or []) if c]
    items = _parse_items(extracted)
    # A capture that is only instructions ("add Dune to my reading list", "call mom tomorrow")
    # saves just its items. Anything else - or a capture that produced no items at all, so the
    # input is never lost - is also kept as a note.
    keep_note = extracted.get("keep_note") is not False or not items

    interaction_id = None
    geo_address = maps_url = None
    _t_db0 = time.perf_counter()
    if keep_note:
        with step("embedding"):
            embedding = embeddings.compute_embedding(raw_text)
        # Opt-in device location (see ChatInput.tsx) - geo_address is only
        # ever populated if a GOOGLE_MAPS_API_KEY is configured; maps_url
        # always works (no key needed), so location capture is useful either
        # way. Both stay None if the user didn't attach a location.
        if geo_lat is not None and geo_lng is not None:
            maps_url = google_maps.build_maps_url(geo_lat, geo_lng)
            geo_address = google_maps.reverse_geocode(geo_lat, geo_lng)
        interaction_id = db.create_interaction(
            user_id,
            initiative_id=initiative_id,
            raw_text=raw_text,
            date=interaction_date,
            location=extracted.get("location"),
            summary=summary,
            topics=extracted.get("topics", []),
            embedding=embedding,
            geo_lat=geo_lat,
            geo_lng=geo_lng,
            geo_address=geo_address,
            maps_url=maps_url,
            decisions=decisions,
            concerns=concerns,
        )

    lists = _ListResolver(user_id)
    tasks_created = []
    task_ids = []
    skipped_due_dates = []
    for item in items:
        task_desc, raw_due_date, owner = item["description"], item.get("due_date"), item["owner"]
        repeat = normalize_repeat(item.get("repeat"))
        due_date = resolve_relative_phrase(raw_due_date)
        due_time = to_valid_time(item.get("due_time"))
        if (due_time or repeat) and not due_date:
            due_date = date.today().isoformat()  # "finish it by 7pm" / "every night" with no day starts today
        if raw_due_date and not resolve_relative_phrase(raw_due_date):
            skipped_due_dates.append({"description": task_desc, "raw_due_date": raw_due_date})
        if repeat:
            due_date = first_occurrence(due_date, repeat)  # "Mom's birthday, 14 March" said in November -> next March
        item_list = lists.resolve(item.get("list"))
        list_id = item_list["id"] if item_list else None
        task_id = db.create_task(user_id, interaction_id, task_desc, due_date=due_date, owner=owner,
                                 due_time=due_time, list_id=list_id, initiative_id=initiative_id,
                                 repeat=repeat, detail=item["detail"])
        task_ids.append(task_id)
        tasks_created.append({
            "id": task_id, "description": task_desc, "due_date": due_date, "due_time": due_time, "owner": owner,
            "repeat": repeat, "list_id": list_id,
            "list_name": item_list["name"] if item_list else None,
            "list_emoji": item_list.get("emoji") if item_list else None,
        })

    print(f"[timing] db_writes: {time.perf_counter() - _t_db0:.2f}s")

    # Keep the search index in step (background - no added latency).
    if interaction_id:
        search_index.enqueue(user_id, "note", [interaction_id])
    search_index.enqueue(user_id, "task", task_ids)

    return {
        "status": "saved",
        # None when the capture was only items - nothing was kept as a note.
        "interaction_id": interaction_id,
        "note_saved": interaction_id is not None,
        "initiative_id": initiative_id,
        # Only ever non-null when initiative_id is null - extraction.py's
        # prompt keeps the two mutually exclusive (a note that already
        # matched an existing initiative has nothing to suggest). The
        # frontend offers "add this as a new initiative?" off of this,
        # and re-tags the note via PATCH /api/notes/{id} once the user says
        # yes - accepting/declining doesn't block the note from having
        # already saved successfully either way. No note, nothing to re-tag.
        "suggested_initiative": (extracted.get("suggested_initiative") or None) if interaction_id else None,
        # Name, not just the id, so the chat UI can tell the user which
        # existing category this note landed in without a separate
        # lookup - None here means Uncategorized (initiative_id is null,
        # or the looked-up initiative no longer exists).
        "initiative_name": (db.get_initiative(user_id, initiative_id) or {}).get("name") if initiative_id else None,
        "summary": summary if interaction_id else "",
        "tasks_created": tasks_created,
        "date_warning": date_warning if interaction_id else None,
        "skipped_due_dates": skipped_due_dates,
        "geo_address": geo_address,
        "maps_url": maps_url,
        "decisions": decisions if interaction_id else [],
        "concerns": concerns if interaction_id else [],
    }


def _process_extracted(user_id: str, raw_text: str, extracted: dict,
                        geo_lat: Optional[float] = None, geo_lng: Optional[float] = None,
                        forced_initiative_id: Optional[int] = None) -> dict:
    interaction_date, date_warning = _resolve_interaction_date(extracted)
    initiative_id = _resolve_initiative(user_id, extracted)
    if forced_initiative_id is not None and db.get_initiative(user_id, forced_initiative_id):
        # The user picked the category themselves: it wins over the model's guess,
        # and there is nothing left to "suggest".
        initiative_id = forced_initiative_id
        extracted = {**extracted, "suggested_initiative": None}
    return _finish_capture_storage(
        user_id, raw_text, extracted, interaction_date, date_warning,
        initiative_id=initiative_id, geo_lat=geo_lat, geo_lng=geo_lng,
    )


# ---------- Endpoints ----------

def _list_names(user_id: str) -> list:
    """The user's list names for extraction.py - empty (rather than failing the capture) if the
    lists table isn't there yet."""
    try:
        return [row["name"] for row in db.get_lists(user_id)]
    except Exception as e:
        print(f"[warn] couldn't read lists (run scripts/migration_37_lists.sql?): {e}")
        return []


async def _capture_text_core(user_id: str, raw_text: str, geo_lat: Optional[float], geo_lng: Optional[float],
                              request: Request, on_stage: Optional[Callable[[str], Awaitable[None]]] = None,
                              initiative_id: Optional[int] = None) -> dict:
    """The actual capture-text logic, factored out of capture_text() below
    so api/routers/chat.py can call it directly after ITS OWN moderation
    check without triggering a second one here - moderation.py is one
    more Groq call, and chat.py already runs it (before intent
    classification, covering the ask/out_of_scope branches too) for
    every message on the app's main path. Deliberately not a bool kwarg
    like `skip_moderation` on the route function itself: FastAPI would
    expose that as a plain, undocumented `?skip_moderation=true` query
    parameter on the real HTTP route, since it isn't a Pydantic body/
    Depends/Path param - i.e. exactly the bypass this is meant to close.
    Keeping the check OUT of this core function and only IN the thin
    route wrapper (capture_text) is what makes that impossible.

    `on_stage`, if given, is awaited with a short stage name right before
    each major step - used by chat.py's streaming endpoint to tell the
    frontend what's happening live. Only two stages are emitted ("extracting"
    and "saving") rather than one per line above: the 2026-10 timing
    instrumentation showed extraction is essentially the entire duration of
    a slow capture, while entitlement-check/get_initiatives/
    embeddings/db-writes are consistently sub-second - not worth
    distinguishing to the user. The plain (non-streaming) capture_text route
    below never passes on_stage, so this is a no-op for every other caller."""
    with step("enforce_entitlement"):
        await run_in_threadpool(_enforce, user_id, "interactions_logged")
    with step("get_initiatives"):
        initiatives = await run_in_threadpool(db.get_initiatives, user_id)
        list_names = await run_in_threadpool(_list_names, user_id)
    initiative_names = [i["name"] for i in initiatives]
    if on_stage:
        await on_stage("extracting")
    try:
        with step("extraction"):
            # An obvious list add ("add Dune to my reading list") is read in code - no LLM call.
            extracted = extraction.quick_extract(raw_text, list_names) or await run_in_threadpool(
                extraction.extract_info, raw_text, None, initiative_names, list_names)
    except RateLimitError:
        raise HTTPException(429, llm_budget.BUSY_MESSAGE)
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {e}")
    # Extraction (the LLM call above) is the slow part of a capture - if the
    # client cancelled the request (e.g. the chat's Stop button) while it was
    # running, don't go on to save a note the user just told us to cancel.
    if await request.is_disconnected():
        raise HTTPException(499, "Client disconnected")
    if on_stage:
        await on_stage("saving")
    with step("process_extracted"):
        return await run_in_threadpool(
            lambda: _process_extracted(user_id, raw_text, extracted, geo_lat=geo_lat, geo_lng=geo_lng,
                                       forced_initiative_id=initiative_id)
        )


@router.post("")
async def capture_text(body: CaptureRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    # Only reached directly here for a caller that ISN'T api/routers/chat.py
    # (which calls _capture_text_core directly, above) - this is this
    # route's one and only moderation check, not a second one layered on
    # top of chat.py's.
    await run_in_threadpool(_reject_if_unsafe, body.raw_text)
    return await _capture_text_core(user_id, body.raw_text, body.geo_lat, body.geo_lng, request)


@router.post("/voice")
@limiter.limit("20/minute")
async def capture_voice(
    request: Request,
    file: UploadFile,
    geo_lat: Optional[float] = Form(None),
    geo_lng: Optional[float] = Form(None),
    user_id: str = Depends(get_current_user_id),
):
    _enforce(user_id, "voice_transcriptions")
    audio_bytes = await file.read()
    try:
        text = voice.transcribe_audio(audio_bytes)
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {e}")
    if not text or not text.strip():
        raise HTTPException(422, "Didn't catch anything in that recording - try again.")
    # This endpoint has no chat.py in front of it at all (the frontend's
    # own mic flow goes through the separate /api/transcribe -> /api/chat
    # path instead - see ChatPage.tsx) - moderation has never run on
    # anything reaching this route, so there's no double-check to avoid.
    _reject_if_unsafe(text)

    # A voice note is ALSO a note - metered separately from the
    # transcription cap above (extraction is a distinct LLM call/cost
    # from Whisper), same as a typed capture would be.
    _enforce(user_id, "interactions_logged")
    initiatives = db.get_initiatives(user_id)
    initiative_names = [i["name"] for i in initiatives]
    try:
        list_names = _list_names(user_id)
        extracted = extraction.quick_extract(text, list_names) or extraction.extract_info(
            text, None, initiative_names, list_names)
    except RateLimitError:
        raise HTTPException(429, llm_budget.BUSY_MESSAGE)
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {e}")

    result = _process_extracted(user_id, text, extracted, geo_lat=geo_lat, geo_lng=geo_lng)
    result["transcript"] = text
    return result
