"""
api/routers/capture.py — REST equivalent of views/chat_view.py's capture
side (text/voice/card), reusing the exact same building blocks
(extraction.py, person_match.py, capture.py's resolve_and_link_other_people,
embeddings.py, date_utils.py) that chat_view.py's _process_extracted()/
finish_capture_storage()/apply_capture_choice() already compose - just
without Streamlit's server-side session_state. See api/schemas.py's
module docstring for how the disambiguation "confirm" step avoids
needing that state.

Note: `import capture` below refers to the root-level capture.py module
(resolve_and_link_other_people) - it shares a name with this file
(api/routers/capture.py) but that's harmless: Python resolves absolute
imports by their full module path (`capture` vs `api.routers.capture`),
not the importing file's own name.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from starlette.concurrency import run_in_threadpool

import capture
import card_scan
import db
import embeddings
import entitlements
import extraction
import google_maps
import moderation
import person_match
import voice
from api.auth import get_current_user_id
from api.rate_limit import limiter
from api.schemas import CandidateEnvelope, CaptureConfirmRequest, CaptureRequest, CardConfirmRequest
from date_utils import resolve_relative_phrase

router = APIRouter()


def _reject_if_unsafe(text: str) -> None:
    """Raises a 400 if `text` fails moderation.py's check - shared by
    every entry point that can turn free-form/OCR'd text into a stored
    Person/Interaction, not just the ones the frontend's chat UI actually
    calls. api/routers/chat.py already moderates text.text before it
    ever reaches capture_text() below, but capture_text/capture_voice/
    capture_card(_confirm) are ALSO their own independently-callable API
    routes (verified: unused by this app's own frontend today, but a
    live, authenticated endpoint all the same) - without this, hitting
    one of those directly would skip moderation entirely, including for
    business-card OCR text, which never went through ANY safety check
    before this. That matters doubly here: unlike a live chat answer, a
    saved Interaction's raw_text later comes back as "trusted" retrieved
    context in a future ask/briefing answer (see retrieval.py) - so
    letting unsafe or prompt-injection content into storage at all is a
    bigger, longer-lived risk than one unmoderated live response would
    be. See capture_text() below for how the one call this WOULD
    double up on (the chat.py-mediated path) avoids re-checking."""
    result = moderation.check(text)
    if not result["safe"]:
        raise HTTPException(400, "This content can't be logged - it looks unsafe or attempts to manipulate the assistant.")


def _enforce(user_id: str, resource: str):
    """Raises a 402 with an upgrade-shaped message if this free-tier
    account has hit its monthly cap for `resource` - called right before
    the expensive step it protects (extraction/transcription/OCR), not
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
    missing initiative is a single dropdown fix later, unlike a wrong
    person match)."""
    name = (extracted.get("initiative") or "").strip()
    if not name:
        return None
    match = db.get_initiative_by_name(user_id, name)
    return match["id"] if match else None


def _resolve_task_person(task_desc: str, primary_name: Optional[str], primary_person_id: Optional[int],
                          linked_others: list, all_people: list) -> Optional[int]:
    """Attributes a follow-up task to whoever it's EXPLICITLY named for,
    whether that's the interaction's primary person, a secondary person
    extraction.py already linked for THIS note, or - as a last resort -
    ANY other existing person this task text happens to name, even if
    extraction didn't flag them at all for this note. That last tier
    matters for a personal task/reminder that references someone without
    describing an interaction with them (e.g. "I need to send David
    Okafor my new email id tonight") - extraction.py's prompt now asks
    for these to show up in other_people regardless of primary_person,
    but LLM extraction is never 100% reliable, so this is a deterministic
    safety net: if a real, already-known person's name is sitting right
    there in the task text, attribute it to them rather than silently
    losing that context to "Personal" every time extraction has an off
    run. No extra LLM call needed for any of this - just substring
    matching, same as the first two tiers.

    Returning the primary person's own id (rather than None) when their
    name is matched - instead of relying on the interaction's primary
    person as an implicit default - matters because the display fallback
    (DigestPage.tsx / morning_brief.py / google_calendar.py) only falls
    back to the interaction's primary person when the task is owed by
    THEM, not by me (a task I own with NO name mentioned shouldn't show
    someone else's name by default - see the Sonali/t-shirt case). If a
    task I own explicitly names the primary person, that distinction
    must survive as an explicit match, not collapse into the same "no
    one named" None as a task that never mentions anyone at all.

    Returns None only when no name - primary, secondary, or any other
    known person - appears in the description at all."""
    desc_lower = task_desc.lower()
    if primary_name and primary_name.lower() in desc_lower:
        return primary_person_id
    for other in linked_others:
        name = other.get("name")
        if name and name.lower() in desc_lower:
            return other["person_id"]

    # Last-resort tier: match against every other existing person by
    # name/alias. Prefer the LONGEST matching name (reduces false
    # positives from short/common names matching as a substring of an
    # unrelated word), and only act on it if exactly one person is tied
    # for that best length - a genuine tie between two different people
    # sharing a name is safer left unattributed than guessed.
    already_checked_ids = {primary_person_id} | {o["person_id"] for o in linked_others}
    best_len, best_ids = 0, set()
    for person in all_people:
        if person["id"] in already_checked_ids:
            continue
        for name in [person["name"]] + (person.get("aliases") or []):
            if name and len(name) >= 3 and name.lower() in desc_lower:
                if len(name) > best_len:
                    best_len, best_ids = len(name), {person["id"]}
                elif len(name) == best_len:
                    best_ids.add(person["id"])
                break
    if best_len and len(best_ids) == 1:
        return next(iter(best_ids))
    return None


def _finish_capture_storage(user_id: str, person_id: Optional[int], resolved_name: Optional[str], created_new: bool,
                             raw_text: str, extracted: dict, interaction_date: str, date_warning: Optional[str],
                             initiative_id: Optional[int] = None,
                             geo_lat: Optional[float] = None, geo_lng: Optional[float] = None) -> dict:
    embedding = embeddings.compute_embedding(raw_text)
    sentiments = extracted.get("sentiments") or []
    extracted_facts = {
        "other_people": extracted.get("other_people", []),
        "opinions_expressed": extracted.get("opinions_expressed", []),
    }

    # Opt-in device location (see ChatInput.tsx) - geo_address is only
    # ever populated if a GOOGLE_MAPS_API_KEY is configured; maps_url
    # always works (no key needed), so location capture is useful either
    # way. Both stay None if the user didn't attach a location.
    geo_address = maps_url = None
    if geo_lat is not None and geo_lng is not None:
        maps_url = google_maps.build_maps_url(geo_lat, geo_lng)
        geo_address = google_maps.reverse_geocode(geo_lat, geo_lng)

    interaction_id = db.create_interaction(
        user_id,
        person_id=person_id,
        initiative_id=initiative_id,
        raw_text=raw_text,
        date=interaction_date,
        location=extracted.get("location"),
        appearance=extracted.get("appearance_this_meeting", "") or "",
        summary=extracted.get("summary", ""),
        sentiment=sentiments,
        topics=extracted.get("topics", []),
        extracted_facts=extracted_facts,
        embedding=embedding,
        geo_lat=geo_lat,
        geo_lng=geo_lng,
        geo_address=geo_address,
        maps_url=maps_url,
        decisions=extracted.get("decisions") or [],
        concerns=extracted.get("concerns") or [],
    )

    # Person-less notes have no primary_person, but a note can still
    # mention OTHER people in passing (e.g. "reminder to call Priya about
    # the trip") - other_people is independent of whether there's a
    # primary person at all.
    #
    # Defensively drop any entry that's just the primary person's own
    # name restated (extraction.py instructs the model not to do this,
    # but a note that repeats the primary person's name throughout - "Met
    # Isha today, she's a UX designer..." - can still trip it up
    # occasionally) - without this, that person ends up linked via
    # interaction_person to their OWN interaction, which then shows up on
    # their profile as a nonsensical "mentioned in a note about
    # themselves" secondary mention, alongside the same note already
    # correctly listed as a direct interaction.
    other_people = [
        o for o in (extracted.get("other_people", []) or [])
        if not (resolved_name and isinstance(o, dict) and (o.get("name") or "").strip().lower() == resolved_name.strip().lower())
    ]
    linked_others = capture.resolve_and_link_other_people(
        user_id, interaction_id, other_people, interaction_date
    )
    already_linked_ids = {person_id} | {o["person_id"] for o in linked_others}
    all_people = db.get_all_people(user_id)

    tasks_created = []
    skipped_due_dates = []
    for item in extracted.get("follow_ups", []) or []:
        if isinstance(item, dict):
            task_desc, raw_due_date = item.get("description", ""), item.get("due_date")
            owner = item.get("owner") or "me"
        else:
            task_desc, raw_due_date, owner = str(item), None, "me"
        if not task_desc:
            continue
        if owner not in ("me", "them"):
            owner = "me"
        due_date = resolve_relative_phrase(raw_due_date)
        if raw_due_date and not due_date:
            skipped_due_dates.append({"description": task_desc, "raw_due_date": raw_due_date})
        task_person_id = _resolve_task_person(task_desc, resolved_name, person_id, linked_others, all_people)
        # A task-text-only match against an existing person (extraction
        # didn't flag them at all for this note) - link them to this
        # interaction too, same as an other_people mention, so this note
        # is discoverable from their own profile later. Track locally so
        # a second task in the same note naming the same fallback-matched
        # person doesn't try to link them twice.
        if task_person_id is not None and task_person_id not in already_linked_ids:
            db.link_interaction_person(user_id, interaction_id, task_person_id, relation="")
            already_linked_ids.add(task_person_id)
        db.create_task(user_id, interaction_id, task_desc, due_date=due_date, owner=owner, person_id=task_person_id)
        tasks_created.append({
            "description": task_desc, "due_date": due_date, "owner": owner, "person_id": task_person_id,
        })

    return {
        "status": "saved",
        "person_id": person_id,
        "resolved_name": resolved_name,
        "created_new": created_new,
        "interaction_id": interaction_id,
        "initiative_id": initiative_id,
        # Only ever non-null when initiative_id is null - extraction.py's
        # prompt keeps the two mutually exclusive (a note that already
        # matched an existing initiative has nothing to suggest). The
        # frontend offers "add this as a new initiative?" off of this,
        # and re-tags the interaction via the existing generic
        # PATCH /api/people/interactions/{id} once the user says yes -
        # no dedicated confirm endpoint needed for this, unlike person
        # disambiguation, since accepting/declining doesn't block the
        # note from having already saved successfully either way.
        "suggested_initiative": extracted.get("suggested_initiative") or None,
        # Name, not just the id, so the chat UI can tell the user which
        # existing category this note landed in without a separate
        # lookup - None here means Uncategorized (initiative_id is null,
        # or the looked-up initiative no longer exists).
        "initiative_name": (db.get_initiative(user_id, initiative_id) or {}).get("name") if initiative_id else None,
        "summary": extracted.get("summary", ""),
        "tasks_created": tasks_created,
        "date_warning": date_warning,
        "skipped_due_dates": skipped_due_dates,
        "geo_address": geo_address,
        "maps_url": maps_url,
        "decisions": extracted.get("decisions") or [],
        "concerns": extracted.get("concerns") or [],
    }


def _process_extracted(user_id: str, raw_text: str, extracted: dict,
                        geo_lat: Optional[float] = None, geo_lng: Optional[float] = None) -> dict:
    interaction_date, date_warning = _resolve_interaction_date(extracted)
    initiative_id = _resolve_initiative(user_id, extracted)

    primary = extracted.get("primary_person")
    if primary is None:
        # Standalone note - no person involved at all (an idea, a to-do,
        # a personal reflection). Nothing to resolve/disambiguate, so
        # this always saves directly, same as the no-candidate-match
        # branch below.
        return _finish_capture_storage(
            user_id, None, None, False, raw_text, extracted, interaction_date, date_warning,
            initiative_id=initiative_id, geo_lat=geo_lat, geo_lng=geo_lng,
        )

    name = primary.get("name") or "Unknown"
    description = primary.get("description") or ""
    role = primary.get("role") or ""
    company = primary.get("company") or ""
    phone = primary.get("phone") or ""
    email = primary.get("email") or ""
    personal_notes = primary.get("personal_notes") or ""
    aliases = primary.get("aliases") or []

    is_unnamed = name.strip().lower() == "unknown"
    has_distinguishing_info = bool(description or role or company or personal_notes)

    if is_unnamed and not has_distinguishing_info:
        # Someone was involved but is both unnamed AND has no other
        # identifying trait at all - not worth promoting to a standalone
        # Person record. It adds nothing searchable, and worse, every
        # OTHER equally-unnamed person from a different note would
        # text-match "Unknown" against this one at 100% (see
        # person_match.py) and risk merging two unrelated people if the
        # match prompt isn't read carefully. The note itself
        # (raw_text/summary) still records that someone was there - it
        # just isn't split out as a trackable Person. Same handling as a
        # fully person-less note.
        return _finish_capture_storage(
            user_id, None, None, False, raw_text, extracted, interaction_date, date_warning,
            initiative_id=initiative_id, geo_lat=geo_lat, geo_lng=geo_lng,
        )

    people = db.get_all_people(user_id)
    # "Unknown" is a placeholder, not an identity - text-matching it
    # against a DIFFERENT unnamed person from another note is meaningless
    # and risks merging unrelated people. Skip candidate matching
    # entirely in that case and always create a fresh record (still
    # worth keeping here since there IS other distinguishing info, e.g.
    # "Unknown - President").
    candidates = [] if is_unnamed else person_match.score_candidates(name, people)

    if not candidates:
        person_id = db.create_person(
            user_id, name=name, description=description, role=role, company=company,
            phone=phone, email=email, first_met_date=interaction_date,
            personal_notes=[{"date": interaction_date, "note": personal_notes}] if personal_notes else [],
            aliases=aliases,
        )
        return _finish_capture_storage(
            user_id, person_id, name, True, raw_text, extracted, interaction_date, date_warning,
            initiative_id=initiative_id, geo_lat=geo_lat, geo_lng=geo_lng,
        )

    return {
        "status": "confirm_required",
        "extracted": extracted,
        "raw_text": raw_text,
        "interaction_date": interaction_date,
        "date_warning": date_warning,
        "initiative_id": initiative_id,
        "geo_lat": geo_lat,
        "geo_lng": geo_lng,
        "candidates": [{"person": p, "score": s} for p, s in candidates],
    }


# ---------- Endpoints ----------

async def _capture_text_core(user_id: str, raw_text: str, geo_lat: Optional[float], geo_lng: Optional[float],
                              request: Request) -> dict:
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
    route wrapper (capture_text) is what makes that impossible."""
    await run_in_threadpool(_enforce, user_id, "interactions_logged")
    initiatives = await run_in_threadpool(db.get_initiatives, user_id)
    initiative_names = [i["name"] for i in initiatives]
    try:
        extracted = await run_in_threadpool(extraction.extract_info, raw_text, None, initiative_names)
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {e}")
    # Extraction (the LLM call above) is the slow part of a capture - if the
    # client cancelled the request (e.g. the chat's Stop button) while it was
    # running, don't go on to save a note the user just told us to cancel.
    if await request.is_disconnected():
        raise HTTPException(499, "Client disconnected")
    return await run_in_threadpool(
        lambda: _process_extracted(user_id, raw_text, extracted, geo_lat=geo_lat, geo_lng=geo_lng)
    )


@router.post("")
async def capture_text(body: CaptureRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    # Only reached directly here for a caller that ISN'T api/routers/chat.py
    # (which calls _capture_text_core directly, above) - this is this
    # route's one and only moderation check, not a second one layered on
    # top of chat.py's.
    await run_in_threadpool(_reject_if_unsafe, body.raw_text)
    return await _capture_text_core(user_id, body.raw_text, body.geo_lat, body.geo_lng, request)


@router.post("/confirm")
def capture_confirm(body: CaptureConfirmRequest, user_id: str = Depends(get_current_user_id)):
    """Resolves the primary-person disambiguation a prior /capture (or
    /capture/voice, or /capture/card/confirm) call returned - mirrors
    chat_view.py's apply_capture_choice(). `body.candidates` is the exact
    list that call returned; the client round-trips it since there's no
    server-side session to remember it from.

    This endpoint only exists because _process_extracted found candidate
    people to disambiguate - which requires a non-null primary_person -
    so `body.extracted["primary_person"]` is guaranteed non-null here
    (the person-less/standalone-note branch always saves directly and
    never reaches this endpoint)."""
    primary = body.extracted.get("primary_person") or {}
    name = primary.get("name") or "Unknown"
    description = primary.get("description") or ""
    role = primary.get("role") or ""
    company = primary.get("company") or ""
    phone = primary.get("phone") or ""
    email = primary.get("email") or ""
    personal_notes = primary.get("personal_notes") or ""
    aliases = primary.get("aliases") or []

    if body.choice is None:
        person_id = db.create_person(
            user_id, name=name, description=description, role=role, company=company,
            phone=phone, email=email, first_met_date=body.interaction_date,
            personal_notes=[{"date": body.interaction_date, "note": personal_notes}] if personal_notes else [],
            aliases=aliases,
        )
        resolved_name, created_new = name, True
    else:
        if body.choice < 0 or body.choice >= len(body.candidates):
            raise HTTPException(400, "choice out of range")
        chosen = body.candidates[body.choice].person
        person_id = chosen["id"]
        if name != chosen["name"]:
            db.add_alias(user_id, person_id, name)
        for alias in aliases:
            if alias and alias != chosen["name"]:
                db.add_alias(user_id, person_id, alias)
        if description:
            db.update_person_description(user_id, person_id, description)
        if personal_notes:
            db.update_person_personal_notes(user_id, person_id, personal_notes, body.interaction_date)
        if role or company:
            db.update_person_role_company(user_id, person_id, role=role, company=company)
        if phone or email:
            contact_fields = {k: v for k, v in [("phone", phone), ("email", email)] if v}
            db.update_person(user_id, person_id, **contact_fields)
        resolved_name, created_new = chosen["name"], False

    return _finish_capture_storage(
        user_id, person_id, resolved_name, created_new, body.raw_text, body.extracted,
        body.interaction_date, body.date_warning, initiative_id=body.initiative_id,
        geo_lat=body.geo_lat, geo_lng=body.geo_lng,
    )


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
        extracted = extraction.extract_info(text, None, initiative_names)
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {e}")

    result = _process_extracted(user_id, text, extracted, geo_lat=geo_lat, geo_lng=geo_lng)
    result["transcript"] = text
    return result


@router.post("/card")
@limiter.limit("20/minute")
async def capture_card(request: Request, file: UploadFile, user_id: str = Depends(get_current_user_id)):
    """OCRs+structures a business card photo (card_scan.py). Returns the
    fields for the client to show an editable confirm form (see
    CardConfirmRequest) - card OCR isn't trusted as-is, unlike voice, so
    nothing is saved here yet."""
    _enforce(user_id, "card_scans")
    image_bytes = await file.read()
    try:
        fields = card_scan.extract_business_card(image_bytes)
    except Exception as e:
        raise HTTPException(422, str(e))
    # OCR'd text is still attacker-controllable content (anyone can print
    # or photograph arbitrary text onto a "card") and, unlike a live chat
    # reply, whatever gets confirmed from this becomes a stored Person
    # record later fed back as retrieved context to future ask/briefing
    # answers - checked here on the raw OCR result so an unsafe card is
    # rejected before the user is even shown it to confirm.
    _reject_if_unsafe(" ".join(str(v) for v in fields.values() if v))
    return fields


@router.post("/card/confirm")
def capture_card_confirm(body: CardConfirmRequest, user_id: str = Depends(get_current_user_id)):
    """Mirrors chat_view.py's render_pending_card() save path: builds the
    same extraction.py-shaped dict from the (possibly user-edited) card
    fields and feeds it through the same _process_extracted() a typed
    note uses - so a scanned name matching an existing person gets the
    exact same /capture/confirm disambiguation as a typed note would.

    Not separately metered against "interactions_logged" - the card scan
    itself already spent this account's "card_scans" allowance (see
    capture_card above), and no LLM extraction call happens here (the
    dict below is built from already-structured OCR fields, not a fresh
    extraction.extract_info() call) - so there's no extra AI cost this
    step needs to protect against."""
    if not body.name.strip():
        raise HTTPException(400, "Name is required.")
    # capture_card() above only ever saw the ORIGINAL OCR result - the
    # user can freely edit every field (including typing a fresh
    # context_note that never went through OCR at all) in the confirm
    # form before this actually saves, so this is checked independently
    # right before storage rather than trusted from that earlier pass.
    _reject_if_unsafe(f"{body.name} {body.role} {body.company} {body.context_note}")
    context_note = body.context_note.strip()
    raw_text = context_note or f"Scanned business card: {body.name}, {body.role} at {body.company}".strip()
    extracted = {
        "primary_person": {
            "name": body.name, "description": "", "role": body.role, "company": body.company,
            "phone": body.phone, "email": body.email,
        },
        # Business-card scans skip LLM extraction entirely (no free text
        # to classify), so there's no initiative classification to do -
        # always lands Uncategorized. A documented v1 limitation, not a bug.
        "initiative": None,
        "date_mentioned": None,
        "location": None,
        "appearance_this_meeting": "",
        "summary": context_note or f"Scanned {body.name}'s business card",
        "sentiments": [], "topics": [], "other_people": [], "opinions_expressed": [],
        "follow_ups": [],
    }
    return _process_extracted(user_id, raw_text, extracted)
