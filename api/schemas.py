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

from pydantic import BaseModel, Field

# Generous caps on every field that ends up inside an LLM prompt - not
# about legitimate use (even a long rambling voice transcript is nowhere
# near these), but a cheap, free mitigation against two real things: a
# giant payload run up against Groq's shared per-account rate/cost
# budget, and "burying" a prompt-injection attempt inside enough padding
# that it's more likely to slip past both moderation.py and the model's
# own attention. NOTE_MAX_LEN covers actual note/question content;
# FIELD_MAX_LEN covers short structured fields (a name, a role) that
# should never legitimately be long anyway.
NOTE_MAX_LEN = 20_000
QUERY_MAX_LEN = 2_000
FIELD_MAX_LEN = 200


class CaptureRequest(BaseModel):
    raw_text: str = Field(..., max_length=NOTE_MAX_LEN)
    # Opt-in device location (see ChatInput.tsx's location toggle) - None
    # unless the user tapped "Add my location" for this specific note.
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None


class CandidateEnvelope(BaseModel):
    person: dict[str, Any]
    score: float


class CaptureConfirmRequest(BaseModel):
    extracted: dict[str, Any]
    raw_text: str = Field(..., max_length=NOTE_MAX_LEN)
    interaction_date: str
    date_warning: Optional[str] = None
    candidates: list[CandidateEnvelope]
    choice: Optional[int] = None  # index into candidates, or None for "new person"
    initiative_id: Optional[int] = None  # round-tripped from the initial /capture call, like geo_lat/geo_lng
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None


class AskRequest(BaseModel):
    query: str = Field(..., max_length=QUERY_MAX_LEN)
    # Recent chat turns as [{"role": "user"|"assistant", "content": str}, ...] -
    # same shape the frontend already needs to render the conversation, and
    # the same shape retrieval.format_recent_context() expects (it does the
    # actual formatting server-side, for pronoun/back-reference resolution -
    # not duplicated client-side).
    history: list[dict[str, Any]] = []


class AskConfirmRequest(BaseModel):
    query: str = Field(..., max_length=QUERY_MAX_LEN)
    parsed: dict[str, Any]
    candidates: list[CandidateEnvelope]
    choice: Optional[int] = None  # index into candidates, or None for "none of these"


class ChatRequest(BaseModel):
    """One unified chat input - api/routers/chat.py classifies it as
    capture or ask and delegates to the matching existing flow (see that
    module's docstring). Superset of CaptureRequest/AskRequest's fields."""
    text: str = Field(..., max_length=NOTE_MAX_LEN)
    history: list[dict[str, Any]] = []
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None


class ChatConfirmRequest(BaseModel):
    """Covers both CaptureConfirmRequest's and AskConfirmRequest's fields -
    `intent` (round-tripped from the initial /api/chat response) says
    which set actually applies. Unused fields for the other intent are
    just left null."""
    intent: str  # "capture" | "ask"
    candidates: list[CandidateEnvelope]
    choice: Optional[int] = None
    # capture fields
    extracted: Optional[dict[str, Any]] = None
    raw_text: Optional[str] = Field(None, max_length=NOTE_MAX_LEN)
    interaction_date: Optional[str] = None
    date_warning: Optional[str] = None
    initiative_id: Optional[int] = None
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None
    # ask fields
    query: Optional[str] = Field(None, max_length=QUERY_MAX_LEN)
    parsed: Optional[dict[str, Any]] = None


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
    decisions: Optional[list[str]] = None
    concerns: Optional[list[str]] = None
    initiative_id: Optional[int] = None


class MergeRequest(BaseModel):
    target_id: int


class CardConfirmRequest(BaseModel):
    """Submitted after the client shows an editable form for the fields
    POST /api/capture/card returned - card OCR isn't trusted as-is,
    unlike voice, so this is a distinct step from a plain text capture."""
    name: str = Field(..., max_length=FIELD_MAX_LEN)
    role: str = Field("", max_length=FIELD_MAX_LEN)
    company: str = Field("", max_length=FIELD_MAX_LEN)
    phone: str = Field("", max_length=FIELD_MAX_LEN)
    email: str = Field("", max_length=FIELD_MAX_LEN)
    context_note: str = Field("", max_length=NOTE_MAX_LEN)


class TaskStatusUpdate(BaseModel):
    status: Optional[str] = None  # "open" | "done"
    owner: Optional[str] = None  # "me" | "them"


class ScheduleCalendarRequest(BaseModel):
    # When to actually put the event, if different from the task's
    # due_date (e.g. scheduling the meeting itself a few days before the
    # due-date deadline). None keeps the original due-date behavior.
    event_date: Optional[str] = None


class UserPreferenceUpdate(BaseModel):
    theme: Optional[str] = None                        # 'dark' | 'light'
    font_size: Optional[str] = None                     # 'small' | 'default' | 'large'
    daily_brief_email_enabled: Optional[bool] = None


class InitiativeCreate(BaseModel):
    name: str
    color: Optional[str] = None


class InitiativeUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
