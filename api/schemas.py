"""
api/schemas.py — Pydantic request models for the FastAPI backend.

Response bodies mostly pass through the plain dicts db.py already returns
(Supabase rows) rather than re-modeling every field - only request bodies
need real validation here.

Design note on the capture/ask "confirm" flow: Streamlit's version keeps
a pending_capture/pending_retrieval dict in server-side st.session_state
between the initial call and the disambiguation confirm click. A
stateless REST API has nowhere to keep that, so the *client* holds it
instead - CaptureConfirmRequest/AskConfirmRequest round-trip the
`candidates` list the initial call returned, so the confirm endpoint
never needs to re-look-up or re-guess what was shown to the user.
"""

from typing import Any, Optional

from pydantic import BaseModel


class CaptureRequest(BaseModel):
    raw_text: str
    # Opt-in device location (see ChatInput.tsx's location toggle) - None
    # unless the user tapped "Add my location" for this specific note.
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None


class CandidateEnvelope(BaseModel):
    person: dict[str, Any]
    score: float


class CaptureConfirmRequest(BaseModel):
    extracted: dict[str, Any]
    raw_text: str
    interaction_date: str
    date_warning: Optional[str] = None
    candidates: list[CandidateEnvelope]
    choice: Optional[int] = None  # index into candidates, or None for "new person"
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None


class AskRequest(BaseModel):
    query: str
    # Recent chat turns as [{"role": "user"|"assistant", "content": str}, ...] -
    # same shape the frontend already needs to render the conversation, and
    # the same shape retrieval.format_recent_context() expects (it does the
    # actual formatting server-side, for pronoun/back-reference resolution -
    # not duplicated client-side).
    history: list[dict[str, Any]] = []


class AskConfirmRequest(BaseModel):
    query: str
    parsed: dict[str, Any]
    candidates: list[CandidateEnvelope]
    choice: Optional[int] = None  # index into candidates, or None for "none of these"


class PersonUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    # personal_notes is NOT here - it's a dated timeline (jsonb list), not
    # a single overwritable field. See AddPersonalNoteRequest below and
    # api/routers/people.py's dedicated add/delete endpoints.
    role: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tags: Optional[list[str]] = None
    first_met_date: Optional[str] = None


class AddPersonalNoteRequest(BaseModel):
    note: str
    date: Optional[str] = None  # defaults to today server-side if not given


class InteractionUpdate(BaseModel):
    date: Optional[str] = None
    location: Optional[str] = None
    appearance: Optional[str] = None
    summary: Optional[str] = None
    raw_text: Optional[str] = None
    meeting_type: Optional[str] = None
    decisions: Optional[list[str]] = None
    concerns: Optional[list[str]] = None


class MergeRequest(BaseModel):
    target_id: int


class CardConfirmRequest(BaseModel):
    """Submitted after the client shows an editable form for the fields
    POST /api/capture/card returned - card OCR isn't trusted as-is,
    unlike voice, so this is a distinct step from a plain text capture."""
    name: str
    role: str = ""
    company: str = ""
    phone: str = ""
    email: str = ""
    context_note: str = ""


class TaskStatusUpdate(BaseModel):
    status: Optional[str] = None  # "open" | "done"
    owner: Optional[str] = None  # "me" | "them"


class ScheduleCalendarRequest(BaseModel):
    # When to actually put the event, if different from the task's
    # due_date (e.g. scheduling the meeting itself a few days before the
    # due-date deadline). None keeps the original due-date behavior.
    event_date: Optional[str] = None


class SignatoryFields(BaseModel):
    name: str
    role: str = ""
    side: str = "client"  # "client" | "provider"


class ClientConfirmRequest(BaseModel):
    """Submitted after the client reviews/edits the fields
    POST /api/clients/upload extracted - contract data is higher-stakes
    than a casual note, so (unlike voice capture) nothing is saved on the
    initial upload, only previewed. `file_base64`/`filename`/`content_type`
    round-trip the original document through this second call since there's
    no server-side session to hold onto the upload between the two
    requests (same reasoning as CaptureConfirmRequest's `candidates`
    round-trip in api/routers/capture.py)."""
    company: str
    client_legal_name: str = ""
    provider_legal_name: str = ""
    effective_date: Optional[str] = None
    term_months: Optional[int] = None
    end_date: Optional[str] = None
    auto_renews: bool = False
    renewal_notice_days: Optional[int] = None
    fee_amount: Optional[float] = None
    fee_currency: str = ""
    fee_frequency: str = ""
    payment_terms: str = ""
    termination_terms: str = ""
    other_terms: str = ""
    signatories: list[SignatoryFields] = []
    file_base64: Optional[str] = None
    filename: Optional[str] = None
    content_type: Optional[str] = None


class ClientUpdate(BaseModel):
    company: Optional[str] = None
    client_legal_name: Optional[str] = None
    provider_legal_name: Optional[str] = None
    effective_date: Optional[str] = None
    term_months: Optional[int] = None
    end_date: Optional[str] = None
    auto_renews: Optional[bool] = None
    renewal_notice_days: Optional[int] = None
    fee_amount: Optional[float] = None
    fee_currency: Optional[str] = None
    fee_frequency: Optional[str] = None
    payment_terms: Optional[str] = None
    termination_terms: Optional[str] = None
    other_terms: Optional[str] = None
    status: Optional[str] = None


class ExtendClientRequest(BaseModel):
    months: int
