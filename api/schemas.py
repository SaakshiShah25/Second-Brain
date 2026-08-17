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
    personal_notes: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tags: Optional[list[str]] = None
    first_met_date: Optional[str] = None


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
