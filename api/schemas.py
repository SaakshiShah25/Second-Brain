"""
api/schemas.py — Pydantic request models for the FastAPI backend.

Response bodies mostly pass through the plain dicts db.py already returns
(Supabase rows) rather than re-modeling every field - only request bodies
need real validation here.
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
# the same reason applies to anything else that reaches a prompt.
NOTE_MAX_LEN = 20_000
QUERY_MAX_LEN = 2_000


class CaptureRequest(BaseModel):
    raw_text: str = Field(..., max_length=NOTE_MAX_LEN)
    # Opt-in device location (see ChatInput.tsx's location toggle) - None
    # unless the user tapped "Add my location" for this specific note.
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None


class AskRequest(BaseModel):
    query: str = Field(..., max_length=QUERY_MAX_LEN)
    # Recent chat turns as [{"role": "user"|"assistant", "content": str}, ...] -
    # same shape the frontend already needs to render the conversation.
    history: list[dict[str, Any]] = []


class ChatRequest(BaseModel):
    """One unified chat input - api/routers/chat.py classifies it as
    capture or ask and delegates to the matching flow (see that module's
    docstring). Superset of CaptureRequest/AskRequest's fields."""
    text: str = Field(..., max_length=NOTE_MAX_LEN)
    history: list[dict[str, Any]] = []
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None
    # The category the user picked for THIS note in the input bar. When set it is
    # used as-is instead of the model's guess; null/absent means "decide for me".
    initiative_id: Optional[int] = None
    # "Save it as a note instead" after the app mistook a to-do for a request to the assistant:
    # skips intent classification and logs the text as a note (moderation still applies).
    as_note: bool = False


class InteractionUpdate(BaseModel):
    date: Optional[str] = None
    location: Optional[str] = None
    appearance: Optional[str] = None
    summary: Optional[str] = None
    raw_text: Optional[str] = None
    decisions: Optional[list[str]] = None
    concerns: Optional[list[str]] = None
    initiative_id: Optional[int] = None


class TaskStatusUpdate(BaseModel):
    status: Optional[str] = None  # "open" | "done"
    owner: Optional[str] = None  # "me" | "them"
    # Edits to the task itself. A field sent as null clears it (e.g. remove the time);
    # a field left out is untouched - so these are read with exclude_unset.
    description: Optional[str] = Field(None, max_length=500)
    due_date: Optional[str] = Field(None, max_length=10)   # YYYY-MM-DD
    due_time: Optional[str] = Field(None, max_length=8)    # HH:MM


class PushKeys(BaseModel):
    p256dh: str = Field(..., max_length=200)
    auth: str = Field(..., max_length=100)


class PushSubscribeRequest(BaseModel):
    """What the browser's PushManager.subscribe() returns, plus the device's IANA time zone."""
    endpoint: str = Field(..., max_length=1000)
    keys: PushKeys
    timezone: str = Field("UTC", max_length=64)


class PushUnsubscribeRequest(BaseModel):
    endpoint: str = Field(..., max_length=1000)


class UserPreferenceUpdate(BaseModel):
    theme: Optional[str] = None                        # 'dark' | 'light'
    font_size: Optional[str] = None                     # 'small' | 'default' | 'large'
    usage_mode: Optional[str] = None                    # 'work' | 'personal' | 'both'


class InitiativeCreate(BaseModel):
    name: str
    color: Optional[str] = None


class InitiativeUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
