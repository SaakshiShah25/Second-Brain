"""
api/routers/clients.py — Clients dashboard: upload a finalized agreement
(PDF/.docx/photo), extract structured deal terms (document_extract.py),
review/edit before saving (mirrors the capture "confirm" pattern - see
api/schemas.py's ClientConfirmRequest docstring), then store both the
structured fields and the original file (storage.py).
"""

import base64
from datetime import date
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile

import db
import document_extract
import person_match
import storage
from api.auth import get_current_user_id
from api.schemas import ClientConfirmRequest, ClientUpdate, ExtendClientRequest

router = APIRouter()

_MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15MB - generous for a text-based agreement document


def _compute_expiry_state(client: dict) -> str:
    """Derived at read time, not stored - same reasoning as
    api/routers/people.py's _days_ago for stale contacts: the underlying
    fact (today's date vs end_date) changes on its own, so computing it
    on read avoids a background job to keep a stored value in sync.
    `status` still gets to override this for a manual "terminated" call,
    which end_date alone can't express (e.g. terminated early)."""
    if client.get("status") == "terminated":
        return "terminated"
    end_date = client.get("end_date")
    if not end_date:
        return "active"
    days_left = (date.fromisoformat(end_date) - date.today()).days
    if days_left < 0:
        return "expired"
    if days_left <= 30:
        return "expiring_soon"
    return "active"


def _with_expiry_state(client: dict) -> dict:
    return {**client, "expiry_state": _compute_expiry_state(client)}


@router.post("/upload")
async def upload_agreement(file: UploadFile, user_id: str = Depends(get_current_user_id)):
    """Extracts + structures the document but does NOT save anything yet -
    the client reviews/edits the result and POSTs it to /confirm. Returns
    the original file re-encoded as base64 so the client can round-trip it
    back through /confirm without a second upload (see ClientConfirmRequest's
    docstring for why - no server-side session to hold onto it otherwise)."""
    file_bytes = await file.read()
    if len(file_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(413, "That file is too large (max 15MB).")
    try:
        extracted = document_extract.extract_agreement_info(file_bytes, file.filename or "document")
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"Couldn't process that document: {e}")

    return {
        "extracted": extracted,
        "file_base64": base64.b64encode(file_bytes).decode("ascii"),
        "filename": file.filename or "document",
        "content_type": file.content_type or "application/octet-stream",
    }


@router.post("/confirm")
def confirm_agreement(body: ClientConfirmRequest, user_id: str = Depends(get_current_user_id)):
    client_id = db.create_client_record(
        user_id,
        company=body.company,
        client_legal_name=body.client_legal_name,
        provider_legal_name=body.provider_legal_name,
        effective_date=body.effective_date,
        term_months=body.term_months,
        end_date=body.end_date,
        auto_renews=body.auto_renews,
        renewal_notice_days=body.renewal_notice_days,
        fee_amount=body.fee_amount,
        fee_currency=body.fee_currency,
        fee_frequency=body.fee_frequency,
        payment_terms=body.payment_terms,
        termination_terms=body.termination_terms,
        other_terms=body.other_terms,
    )

    if body.file_base64 and body.filename:
        file_bytes = base64.b64decode(body.file_base64)
        content_type = body.content_type or "application/octet-stream"
        path = storage.upload_document(user_id, client_id, body.filename, file_bytes, content_type)
        db.update_client_record(user_id, client_id, document_path=path, document_filename=body.filename)

    people = db.get_all_people(user_id)
    for sig in body.signatories:
        if not sig.name.strip():
            continue
        match = person_match.find_confident_match(sig.name, people)
        db.create_client_signatory(
            user_id, client_id, name=sig.name, role=sig.role, side=sig.side,
            person_id=match["id"] if match else None,
        )

    return _with_expiry_state(db.get_client_record(user_id, client_id))


@router.get("")
def list_clients(user_id: str = Depends(get_current_user_id)):
    return [_with_expiry_state(c) for c in db.get_all_clients(user_id)]


@router.get("/{client_id}")
def get_client_detail(client_id: int, user_id: str = Depends(get_current_user_id)):
    try:
        client = db.get_client_record(user_id, client_id)
    except Exception:
        raise HTTPException(404, "Client not found")
    if not client:
        raise HTTPException(404, "Client not found")
    signatories = db.get_client_signatories(user_id, client_id)
    return {**_with_expiry_state(client), "signatories": signatories}


@router.get("/{client_id}/document")
def get_client_document_url(client_id: int, user_id: str = Depends(get_current_user_id)):
    client = db.get_client_record(user_id, client_id)
    if not client or not client.get("document_path"):
        raise HTTPException(404, "No document on file for this client.")
    url = storage.get_document_url(client["document_path"])
    return {"url": url, "filename": client.get("document_filename") or "document"}


@router.post("/{client_id}/extend")
def extend_client(client_id: int, body: ExtendClientRequest, user_id: str = Depends(get_current_user_id)):
    """Pushes a contract's end date out by `months` - deterministic date
    math in code (relativedelta), not asked of an LLM (same reasoning as
    date_utils.resolve_relative_phrase: exact calendar arithmetic is worth
    getting right in code, not guessed at). Extends from the existing
    end_date if there is one, else from effective_date, else from today -
    whichever is the best anchor available. Does not touch `status`: if a
    contract was manually marked 'terminated', extending it further is a
    contradiction the user should resolve explicitly via Edit, not have
    silently reversed here; if it just naturally expired, expiry_state
    recomputes to active/expiring_soon on its own once end_date moves out,
    with no separate flag to flip."""
    if body.months <= 0:
        raise HTTPException(400, "months must be positive")

    client = db.get_client_record(user_id, client_id)
    if not client:
        raise HTTPException(404, "Client not found")

    anchor = client.get("end_date") or client.get("effective_date") or date.today().isoformat()
    new_end_date = (date.fromisoformat(anchor) + relativedelta(months=body.months)).isoformat()

    fields = {"end_date": new_end_date}
    if client.get("term_months") is not None:
        fields["term_months"] = client["term_months"] + body.months

    db.update_client_record(user_id, client_id, **fields)
    return _with_expiry_state(db.get_client_record(user_id, client_id))


@router.patch("/{client_id}")
def update_client(client_id: int, body: ClientUpdate, user_id: str = Depends(get_current_user_id)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if fields:
        db.update_client_record(user_id, client_id, **fields)
    return _with_expiry_state(db.get_client_record(user_id, client_id))


@router.delete("/{client_id}")
def delete_client(client_id: int, user_id: str = Depends(get_current_user_id)):
    client = db.get_client_record(user_id, client_id)
    if client and client.get("document_path"):
        storage.delete_document(client["document_path"])
    db.delete_client_record(user_id, client_id)
    return {"ok": True}
