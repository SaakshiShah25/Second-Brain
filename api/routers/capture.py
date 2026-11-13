"""
api/routers/capture.py — Logging a capture: text (and voice, via transcription)
goes through extraction.py and is saved as items (to-dos, list entries, routines,
dates) and - only when there is something to remember - a note per initiative.
Everything saved is queued for the search index. `_capture_text_core` is also what
api/routers/chat.py calls for the main chat input.
"""

import time
import uuid
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

TRACK_WHO_OWES = False


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


def _existing_initiative_for_suggestion(user_id: str, group: dict) -> Optional[int]:
    """The model proposes a broad new category when none of the user's fits (extraction.py). It is never created
    here - the user is asked first (the chat reply offers "Create / Rename / Keep in Others"). The one thing done
    automatically: if the proposed name is really one the user already has (a different spelling of the same
    name), the note goes there."""
    name = " ".join(str(group.get("suggested_initiative") or "").split()).strip(" .\"'")
    if not name:
        return None
    existing = db.get_initiative_by_name(user_id, name)
    return existing["id"] if existing else None


class _ListResolver:
    """Turns the list names the model gives into lists for one capture, creating a list the first
    time it's needed. The main Tasks list is no list at all (None)."""

    def __init__(self, user_id: str):
        self.user_id = user_id
        self.cache: dict = {}
        self._lists = None
        self._spaces: dict = {}

    def _existing(self, name: str, space_id: Optional[int]) -> Optional[dict]:
        """The user's list that means the same as `name` - "Films" finds "Movies", "my reading list" finds
        "Books" - so loose wording never makes a second list for the same pile. A list belongs to one space, so
        when the space is known only its list there counts; when it isn't, any list of that name will do."""
        if self._lists is None:
            self._lists = db.get_lists(self.user_id)
        if space_id is not None:
            return db.find_list(self.user_id, name, space_id, lists=self._lists)
        key = text_utils.list_key(name)
        return next((l for l in self._lists if text_utils.list_key(l["name"]) == key), None)

    def resolve(self, name, space_id: Optional[int] = None) -> Optional[dict]:
        name = " ".join(str(name or "").split())[:40]
        if not name or name.lower() in text_utils.MAIN_LIST_NAMES:
            return None
        key = (text_utils.list_key(name), space_id)
        if key not in self.cache:
            found = self._existing(name, space_id)
            if not found:
                title = text_utils.canonical_list_title(name) or (name[:1].upper() + name[1:])
                found = db.create_list(self.user_id, title, text_utils.list_emoji(title), initiative_id=space_id)
                if self._lists is not None:
                    self._lists.append(found)
            self.cache[key] = found
        return self.cache[key]

    def home_space(self, item_list: Optional[dict]) -> Optional[int]:
        """The space this list's items already live in (looked up once per list per capture)."""
        if not item_list:
            return None
        if item_list["id"] not in self._spaces:
            self._spaces[item_list["id"]] = db.get_list_initiative(self.user_id, item_list["id"])
        return self._spaces[item_list["id"]]


def _parse_items(extracted: dict) -> list:
    """extraction.py's follow_ups as clean dicts; empty ones dropped."""
    items = []
    for item in extracted.get("follow_ups", []) or []:
        if not isinstance(item, dict):
            item = {"description": str(item)}
        desc = text_utils.clean_task_text(item.get("description", ""))
        if not desc:
            continue
        # The app doesn't track "someone else owes this" yet (the toggle and labels are gone), so everything the AI finds
        # is a plain to-do. Flip TRACK_WHO_OWES to bring the AI's guess back.
        owner = item.get("owner") if TRACK_WHO_OWES and item.get("owner") in ("me", "them") else "me"
        detail = " ".join(str(item.get("detail") or "").split())[:1000] or None
        items.append({**item, "description": desc, "owner": owner, "detail": detail})
    return items


def _finish_capture_storage(user_id: str, raw_text: str, extracted: dict, interaction_date: str,
                             initiative_id: Optional[int] = None,
                             geo_lat: Optional[float] = None, geo_lng: Optional[float] = None,
                             geo_address: Optional[str] = None, maps_url: Optional[str] = None,
                             embedding=None, batch: Optional[str] = None,
                             source_id: Optional[int] = None, save_note: bool = True,
                             lists: Optional[_ListResolver] = None) -> dict:
    """Saves ONE initiative's share of a logged message as its own note (with its own items) and returns what to
    tell the user about it. With `save_note` False (a message that is only to-dos and list entries) just the
    items are saved and `interaction_id` comes back None. `raw_text` is the message as written; `extracted` holds this initiative's points,
    decisions, concerns and follow-ups. The notes that came from the same message are tied together: either by
    `source_id` (they point at the first note, which holds the original text once) or, when that column isn't
    available yet, by a shared `batch` id with the original text repeated on each."""
    # The summary is stored as short "- " bullet points on purpose (see extraction.py); decisions,
    # concerns and tasks are single lines, so a stray list marker at their start is dropped.
    decisions = [d for d in (text_utils.strip_bullet(x) for x in extracted.get("decisions") or []) if d]
    concerns = [c for c in (text_utils.strip_bullet(x) for x in extracted.get("concerns") or []) if c]
    items = _parse_items(extracted)
    task_texts = [i["description"] for i in items]
    # Every fact is shown once: a point that merely restates a decision, concern or task is dropped
    # (the extraction prompt asks for this too; this keeps it true even if the model repeats itself).
    summary = text_utils.dedupe_points(
        text_utils.as_bullets(extracted.get("summary", "") or ""), decisions + concerns + task_texts
    )
    section = text_utils.clean_section(extracted.get("section"))

    _t_db0 = time.perf_counter()
    interaction_id = None
    if save_note:
        interaction_id = db.create_interaction(
            user_id,
            initiative_id=initiative_id,
            raw_text=raw_text,
            source_id=source_id,
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
            # the topic label groups the note on its initiative's page; the batch id ties the notes of one message together
            extracted_facts={k: v for k, v in (("section", section), ("batch", batch)) if v} or None,
        )

    tasks_created = []
    task_ids = []
    skipped_due_dates = []
    lists = lists or _ListResolver(user_id)
    item_spaces = []
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
        item_list = lists.resolve(item.get("list"), initiative_id)
        list_id = item_list["id"] if item_list else None
        # Nothing said where it belongs: it goes to the space its list already lives in.
        item_space = initiative_id if initiative_id is not None else lists.home_space(item_list)
        item_spaces.append(item_space)
        task_id = db.create_task(user_id, interaction_id, task_desc, due_date=due_date, owner=owner,
                                 due_time=due_time, initiative_id=item_space, list_id=list_id,
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

    # A part that was only items reports the space they went to (they may have followed their list's space), so the
    # reply can say where they are and offer to change it.
    reported = initiative_id
    if reported is None and interaction_id is None and len(set(item_spaces)) == 1 and item_spaces[0] is not None:
        reported = item_spaces[0]

    return {
        # None when the message was only items - nothing was kept as a note.
        "interaction_id": interaction_id,
        "note_saved": interaction_id is not None,
        "initiative_id": reported,
        # Only ever non-null when initiative_id is null - extraction.py's prompt keeps the two mutually
        # exclusive. The frontend offers "add this as a new initiative?" off of this, and re-tags the note
        # via PATCH /api/notes/{id} once the user says yes.
        "suggested_initiative": (extracted.get("suggested_initiative") or None) if interaction_id else None,
        # Name, not just the id, so the chat UI can say where this part landed (None = Others).
        "initiative_name": (db.get_initiative(user_id, reported) or {}).get("name") if reported else None,
        "summary": summary if interaction_id else "",
        "tasks_created": tasks_created,
        "skipped_due_dates": skipped_due_dates,
        "decisions": decisions if interaction_id else [],
        "concerns": concerns if interaction_id else [],
    }


def _list_names(user_id: str) -> list:
    """The user's list names for extraction.py - empty (rather than failing the capture) if the
    lists table isn't there yet."""
    try:
        return [row["name"] for row in db.get_lists(user_id)]
    except Exception as e:
        print(f"[warn] couldn't read lists (run scripts/migration_40_lists.sql?): {e}")
        return []


def _process_extracted(user_id: str, raw_text: str, extracted: dict,
                        geo_lat: Optional[float] = None, geo_lng: Optional[float] = None,
                        forced_initiative_id: Optional[int] = None) -> dict:
    """Files a logged message. The model extracted everything in ONE call and tagged each item with the initiative
    it is about (extraction.note_groups), so one message can land in several initiatives: one note per initiative,
    each with its own tasks. If the user picked the category themselves, nothing is split: the whole message goes
    there."""
    interaction_date, date_warning = _resolve_interaction_date(extracted)
    groups = extraction.note_groups(raw_text, extracted)
    # A message that is only instructions ("add Dune to my reading list", "call mom tomorrow") saves just its
    # items. Anything else - or a message that produced no items at all, so the input is never lost - is also
    # kept as a note.
    has_items = any(g.get("follow_ups") for g in groups)
    keep_note = extracted.get("keep_note") is not False or not has_items
    forced = forced_initiative_id is not None and db.get_initiative(user_id, forced_initiative_id)
    if forced:
        groups = [extraction.collapse_groups(raw_text, groups)]

    # Opt-in device location (see ChatInput.tsx) - geo_address is only ever populated if a GOOGLE_MAPS_API_KEY
    # is configured; maps_url always works (no key needed). Looked up once, shared by every note.
    geo_address = maps_url = None
    if keep_note and geo_lat is not None and geo_lng is not None:
        maps_url = google_maps.build_maps_url(geo_lat, geo_lng)
        geo_address = google_maps.reverse_geocode(geo_lat, geo_lng)

    # The original text is the same for every note of this message, so it is embedded once.
    embedding = None
    if keep_note:
        with step("embedding"):
            embedding = embeddings.compute_embedding((raw_text or "").strip())
    # A message that lands in several initiatives is saved once, with the original text on its first note; the other
    # notes only point at it (so deleting or editing the original reaches every initiative it touches).
    link = keep_note and len(groups) > 1 and db.source_links_supported()
    batch = uuid.uuid4().hex[:12] if keep_note and len(groups) > 1 and not link else None

    lists = _ListResolver(user_id)
    saved = []
    for group in groups:
        # the date and the place the message mentions apply to every note made from it
        group = {**group, "location": extracted.get("location")}
        if forced:
            # the user's own choice wins over the model's guess, and there is nothing left to "suggest"
            initiative_id, group["suggested_initiative"] = forced_initiative_id, None
        else:
            initiative_id = _resolve_initiative(user_id, group)
            if initiative_id is None:
                initiative_id = _existing_initiative_for_suggestion(user_id, group)
            if initiative_id is not None:
                group["suggested_initiative"] = None
        follower = link and bool(saved)
        saved.append(_finish_capture_storage(
            user_id, "" if follower else group["raw_text"], group, interaction_date, initiative_id=initiative_id,
            geo_lat=geo_lat, geo_lng=geo_lng, geo_address=geo_address, maps_url=maps_url,
            embedding=None if follower else embedding, batch=batch,
            source_id=saved[0]["interaction_id"] if follower else None,
            save_note=keep_note, lists=lists,
        ))
    if not keep_note:
        saved = [p for p in saved if p["tasks_created"]]  # a group with no items has nothing to show

    return {
        "status": "saved",
        "parts": saved,
        "date_warning": date_warning,
        "skipped_due_dates": [d for p in saved for d in p["skipped_due_dates"]],
        "geo_address": geo_address,
        "maps_url": maps_url,
    }


# ---------- Endpoints ----------

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
