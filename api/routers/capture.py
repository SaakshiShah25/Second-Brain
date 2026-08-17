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

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile

import capture
import card_scan
import db
import embeddings
import extraction
import google_maps
import person_match
import voice
from api.auth import get_current_user_id
from api.schemas import CandidateEnvelope, CaptureConfirmRequest, CaptureRequest, CardConfirmRequest
from date_utils import to_valid_date

router = APIRouter()


# ---------- Shared capture tail (mirrors chat_view.py) ----------

def _resolve_interaction_date(extracted: dict):
    raw_date = extracted.get("date_mentioned")
    resolved = to_valid_date(raw_date) or date.today().isoformat()
    warning = None
    if raw_date and not to_valid_date(raw_date):
        warning = f"note: extracted date '{raw_date}' wasn't complete, used {resolved} instead"
    return resolved, warning


def _finish_capture_storage(user_id: str, person_id: int, resolved_name: str, created_new: bool, raw_text: str,
                             extracted: dict, interaction_date: str, date_warning: Optional[str],
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
        meeting_type=extracted.get("meeting_type") or "",
        decisions=extracted.get("decisions") or [],
        concerns=extracted.get("concerns") or [],
    )

    capture.resolve_and_link_other_people(
        user_id, interaction_id, extracted.get("other_people", []) or [], interaction_date
    )

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
        due_date = to_valid_date(raw_due_date)
        if raw_due_date and not due_date:
            skipped_due_dates.append({"description": task_desc, "raw_due_date": raw_due_date})
        db.create_task(user_id, interaction_id, task_desc, due_date=due_date, owner=owner)
        tasks_created.append({"description": task_desc, "due_date": due_date, "owner": owner})

    return {
        "status": "saved",
        "person_id": person_id,
        "resolved_name": resolved_name,
        "created_new": created_new,
        "interaction_id": interaction_id,
        "summary": extracted.get("summary", ""),
        "tasks_created": tasks_created,
        "date_warning": date_warning,
        "skipped_due_dates": skipped_due_dates,
        "geo_address": geo_address,
        "maps_url": maps_url,
        "meeting_type": extracted.get("meeting_type") or "",
        "decisions": extracted.get("decisions") or [],
        "concerns": extracted.get("concerns") or [],
    }


def _process_extracted(user_id: str, raw_text: str, extracted: dict,
                        geo_lat: Optional[float] = None, geo_lng: Optional[float] = None) -> dict:
    primary = extracted.get("primary_person", {}) or {}
    name = primary.get("name") or "Unknown"
    description = primary.get("description") or ""
    role = primary.get("role") or ""
    company = primary.get("company") or ""
    phone = primary.get("phone") or ""
    email = primary.get("email") or ""
    personal_notes = primary.get("personal_notes") or ""

    interaction_date, date_warning = _resolve_interaction_date(extracted)

    people = db.get_all_people(user_id)
    candidates = person_match.score_candidates(name, people)

    if not candidates:
        person_id = db.create_person(
            user_id, name=name, description=description, role=role, company=company,
            phone=phone, email=email, first_met_date=interaction_date, personal_notes=personal_notes,
        )
        return _finish_capture_storage(
            user_id, person_id, name, True, raw_text, extracted, interaction_date, date_warning,
            geo_lat=geo_lat, geo_lng=geo_lng,
        )

    return {
        "status": "confirm_required",
        "extracted": extracted,
        "raw_text": raw_text,
        "interaction_date": interaction_date,
        "date_warning": date_warning,
        "geo_lat": geo_lat,
        "geo_lng": geo_lng,
        "candidates": [{"person": p, "score": s} for p, s in candidates],
    }


# ---------- Endpoints ----------

@router.post("")
def capture_text(body: CaptureRequest, user_id: str = Depends(get_current_user_id)):
    try:
        extracted = extraction.extract_info(body.raw_text)
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {e}")
    return _process_extracted(user_id, body.raw_text, extracted, geo_lat=body.geo_lat, geo_lng=body.geo_lng)


@router.post("/confirm")
def capture_confirm(body: CaptureConfirmRequest, user_id: str = Depends(get_current_user_id)):
    """Resolves the primary-person disambiguation a prior /capture (or
    /capture/voice, or /capture/card/confirm) call returned - mirrors
    chat_view.py's apply_capture_choice(). `body.candidates` is the exact
    list that call returned; the client round-trips it since there's no
    server-side session to remember it from."""
    primary = body.extracted.get("primary_person", {}) or {}
    name = primary.get("name") or "Unknown"
    description = primary.get("description") or ""
    role = primary.get("role") or ""
    company = primary.get("company") or ""
    phone = primary.get("phone") or ""
    email = primary.get("email") or ""
    personal_notes = primary.get("personal_notes") or ""

    if body.choice is None:
        person_id = db.create_person(
            user_id, name=name, description=description, role=role, company=company,
            phone=phone, email=email, first_met_date=body.interaction_date, personal_notes=personal_notes,
        )
        resolved_name, created_new = name, True
    else:
        if body.choice < 0 or body.choice >= len(body.candidates):
            raise HTTPException(400, "choice out of range")
        chosen = body.candidates[body.choice].person
        person_id = chosen["id"]
        if name != chosen["name"]:
            db.add_alias(user_id, person_id, name)
        if description:
            db.update_person_description(user_id, person_id, description)
        if personal_notes:
            db.update_person_personal_notes(user_id, person_id, personal_notes)
        if role or company:
            db.update_person_role_company(user_id, person_id, role=role, company=company)
        if phone or email:
            contact_fields = {k: v for k, v in [("phone", phone), ("email", email)] if v}
            db.update_person(user_id, person_id, **contact_fields)
        resolved_name, created_new = chosen["name"], False

    return _finish_capture_storage(
        user_id, person_id, resolved_name, created_new, body.raw_text, body.extracted,
        body.interaction_date, body.date_warning, geo_lat=body.geo_lat, geo_lng=body.geo_lng,
    )


@router.post("/voice")
async def capture_voice(
    file: UploadFile,
    geo_lat: Optional[float] = Form(None),
    geo_lng: Optional[float] = Form(None),
    user_id: str = Depends(get_current_user_id),
):
    audio_bytes = await file.read()
    try:
        text = voice.transcribe_audio(audio_bytes)
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {e}")
    if not text or not text.strip():
        raise HTTPException(422, "Didn't catch anything in that recording - try again.")

    try:
        extracted = extraction.extract_info(text)
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {e}")

    result = _process_extracted(user_id, text, extracted, geo_lat=geo_lat, geo_lng=geo_lng)
    result["transcript"] = text
    return result


@router.post("/card")
async def capture_card(file: UploadFile, user_id: str = Depends(get_current_user_id)):
    """OCRs+structures a business card photo (card_scan.py). Returns the
    fields for the client to show an editable confirm form (see
    CardConfirmRequest) - card OCR isn't trusted as-is, unlike voice, so
    nothing is saved here yet."""
    image_bytes = await file.read()
    try:
        return card_scan.extract_business_card(image_bytes)
    except Exception as e:
        raise HTTPException(422, str(e))


@router.post("/card/confirm")
def capture_card_confirm(body: CardConfirmRequest, user_id: str = Depends(get_current_user_id)):
    """Mirrors chat_view.py's render_pending_card() save path: builds the
    same extraction.py-shaped dict from the (possibly user-edited) card
    fields and feeds it through the same _process_extracted() a typed
    note uses - so a scanned name matching an existing person gets the
    exact same /capture/confirm disambiguation as a typed note would."""
    if not body.name.strip():
        raise HTTPException(400, "Name is required.")
    context_note = body.context_note.strip()
    raw_text = context_note or f"Scanned business card: {body.name}, {body.role} at {body.company}".strip()
    extracted = {
        "primary_person": {
            "name": body.name, "description": "", "role": body.role, "company": body.company,
            "phone": body.phone, "email": body.email,
        },
        "date_mentioned": None,
        "location": None,
        "appearance_this_meeting": "",
        "summary": context_note or f"Scanned {body.name}'s business card",
        "sentiments": [], "topics": [], "other_people": [], "opinions_expressed": [],
        "follow_ups": [],
    }
    return _process_extracted(user_id, raw_text, extracted)
