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

from pydantic import BaseModel, Field, field_validator

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


class ImportantDateIn(BaseModel):
    """One birthday/anniversary on a person's profile - see
    important_dates.py for how these are validated and used."""
    label: str = Field(..., min_length=1, max_length=60)
    month: int = Field(..., ge=1, le=12)
    day: int = Field(..., ge=1, le=31)
    year: Optional[int] = Field(None, ge=1900, le=2100)


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
    # Keep in touch (keep_in_touch.py). Sent as null to switch it off / clear a snooze.
    keep_in_touch_days: Optional[int] = None
    keep_in_touch_snoozed_until: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    # The whole list, replacing what's stored - the profile's edit UI
    # always sends the full set it's showing.
    important_dates: Optional[list[ImportantDateIn]] = Field(None, max_length=20)


    @field_validator("keep_in_touch_days")
    @classmethod
    def _valid_frequency(cls, v):
        if v is not None and v not in (7, 14, 30, 60, 90, 180, 365):
            raise ValueError("keep_in_touch_days must be one of 7, 14, 30, 60, 90, 180, 365")
        return v


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
    name: str = Field(..., max_length=FIELD_MAX_LEN)
    color: Optional[str] = Field(None, max_length=20)
    # A key from the frontend's icon set (lib/initiativeStyle.ts), e.g. "rocket".
    icon: Optional[str] = Field(None, pattern=r"^[a-z0-9-]{1,30}$")


class InitiativeUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=FIELD_MAX_LEN)
    color: Optional[str] = Field(None, max_length=20)
    icon: Optional[str] = Field(None, pattern=r"^[a-z0-9-]{1,30}$")


REPORT_REASONS = ("incorrect", "offensive", "irrelevant", "other")


class ReportCreate(BaseModel):
    """A user flagging an AI-generated reply. `question` is whatever the
    user sent right before it, `answer` is the reply being reported."""
    kind: str = Field("answer", pattern="^(answer|capture)$")
    reason: str = Field(..., pattern="^(incorrect|offensive|irrelevant|other)$")
    question: str = Field("", max_length=QUERY_MAX_LEN)
    answer: str = Field(..., max_length=NOTE_MAX_LEN)
    details: str = Field("", max_length=1_000)
    source_interaction_ids: list[int] = Field(default_factory=list, max_length=50)


# ---------- App lock (account-wide PIN, see app_lock.py) ----------

class AppLockSet(BaseModel):
    pin: str = Field(..., pattern=r"^\d{4,6}$")  # 4-6 digits
    current_pin: Optional[str] = Field(None, max_length=12)  # required to change an existing PIN


class AppLockVerify(BaseModel):
    pin: str = Field(..., max_length=12)


class AppLockDisable(BaseModel):
    pin: str = Field(..., max_length=12)
