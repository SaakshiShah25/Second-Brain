"""
extraction_schema.py - strict validation for what the extraction model
returns (and for the `extracted` dict a client sends back on a confirm
call).

The model's JSON used to go straight from json.loads() into the database
code, so a wrong type ("follow_ups": "none"), a runaway list, or a
200-person "other_people" array would flow through as-is. Everything now
passes through the Pydantic models below first:

- Types are coerced or dropped, never trusted: a number where a string
  belongs becomes text, a non-list where a list belongs becomes empty, an
  invalid month becomes null.
- Every string has a length cap, and every list has a FAN-OUT cap - the
  most people, tasks, dates etc. a single note can create. A 20,000
  character note that mentions a hundred names produces at most
  MAX_OTHER_PEOPLE new contacts and MAX_FOLLOW_UPS tasks; the rest are
  dropped (first ones kept, in the order the model listed them).
- Unknown keys are discarded, so nothing unexpected reaches db.py.

sanitize() never raises on bad *content* - it returns the cleaned dict -
only on input that isn't a JSON object at all.
"""

from typing import Annotated, Any, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, field_validator

# Fan-out caps: the most records ONE note can create.
MAX_OTHER_PEOPLE = 10
MAX_FOLLOW_UPS = 10
MAX_IMPORTANT_DATES = 5
MAX_SENTIMENTS = 10
MAX_TOPICS = 15
MAX_OPINIONS = 10
MAX_CONCERNS = 10
MAX_DECISIONS = 10
MAX_ALIASES = 5


def _text(limit: int):
    def convert(value: Any) -> str:
        if value is None or isinstance(value, (dict, list, tuple, set)):
            return ""
        return str(value).strip()[:limit]
    return convert


def _opt_text(limit: int):
    inner = _text(limit)
    def convert(value: Any) -> Optional[str]:
        out = inner(value)
        return out or None
    return convert


def _text_list(max_items: int, item_limit: int):
    inner = _text(item_limit)
    def convert(value: Any) -> list:
        if not isinstance(value, list):
            return []
        cleaned = [inner(v) for v in value]
        return [c for c in cleaned if c][:max_items]
    return convert


def _int_or_none(value: Any) -> Optional[int]:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _bool(value: Any) -> bool:
    return value is True or (isinstance(value, str) and value.strip().lower() == "true")


def _owner(value: Any) -> str:
    return "them" if isinstance(value, str) and value.strip().lower() == "them" else "me"


class _Loose(BaseModel):
    model_config = ConfigDict(extra="ignore")


class ImportantDateModel(_Loose):
    label: Annotated[str, BeforeValidator(_text(60))] = ""
    month: Annotated[Optional[int], BeforeValidator(_int_or_none)] = None
    day: Annotated[Optional[int], BeforeValidator(_int_or_none)] = None
    year: Annotated[Optional[int], BeforeValidator(_int_or_none)] = None
    when: Annotated[Optional[str], BeforeValidator(_opt_text(60))] = None


class PrimaryPersonModel(_Loose):
    name: Annotated[str, BeforeValidator(_text(120))] = "Unknown"
    aliases: Annotated[list, BeforeValidator(_text_list(MAX_ALIASES, 60))] = []
    description: Annotated[str, BeforeValidator(_text(600))] = ""
    role: Annotated[str, BeforeValidator(_text(120))] = ""
    company: Annotated[str, BeforeValidator(_text(120))] = ""
    personal_notes: Annotated[str, BeforeValidator(_text(1500))] = ""
    phone: Annotated[str, BeforeValidator(_text(40))] = ""
    email: Annotated[str, BeforeValidator(_text(120))] = ""
    important_dates: list[dict] = []

    @field_validator("name", mode="after")
    @classmethod
    def _name_default(cls, v: str) -> str:
        return v or "Unknown"

    @field_validator("important_dates", mode="before")
    @classmethod
    def _dates(cls, value: Any) -> list:
        if not isinstance(value, list):
            return []
        out = []
        for item in value:
            if not isinstance(item, dict):
                continue
            model = ImportantDateModel.model_validate(item)
            if model.label:
                out.append(model.model_dump())
            if len(out) >= MAX_IMPORTANT_DATES:
                break
        return out


class OtherPersonModel(_Loose):
    name: Annotated[str, BeforeValidator(_text(120))] = ""
    relation: Annotated[str, BeforeValidator(_text(200))] = ""
    present: Annotated[bool, BeforeValidator(_bool)] = False


class SentimentModel(_Loose):
    topic: Annotated[str, BeforeValidator(_text(120))] = ""
    sentiment: Annotated[str, BeforeValidator(_text(120))] = ""


class FollowUpModel(_Loose):
    description: Annotated[str, BeforeValidator(_text(400))] = ""
    due_date: Annotated[Optional[str], BeforeValidator(_opt_text(40))] = None
    owner: Annotated[str, BeforeValidator(_owner)] = "me"


def _object_list(model: type, max_items: int, required: str):
    """A list of objects validated one by one: non-objects are dropped, so
    are objects missing their one required field, and the list is cut at
    `max_items`."""
    def convert(value: Any) -> list:
        if not isinstance(value, list):
            return []
        out = []
        for item in value:
            if not isinstance(item, dict):
                continue
            dumped = model.model_validate(item).model_dump()
            if dumped.get(required):
                out.append(dumped)
            if len(out) >= max_items:
                break
        return out
    return convert


class ExtractedNote(_Loose):
    primary_person: Optional[PrimaryPersonModel] = None
    initiative: Annotated[Optional[str], BeforeValidator(_opt_text(60))] = None
    suggested_initiative: Annotated[Optional[str], BeforeValidator(_opt_text(60))] = None
    other_people: Annotated[list, BeforeValidator(_object_list(OtherPersonModel, MAX_OTHER_PEOPLE, "name"))] = []
    date_mentioned: Annotated[Optional[str], BeforeValidator(_opt_text(40))] = None
    location: Annotated[Optional[str], BeforeValidator(_opt_text(200))] = None
    appearance_this_meeting: Annotated[str, BeforeValidator(_text(300))] = ""
    summary: Annotated[str, BeforeValidator(_text(1000))] = ""
    sentiments: Annotated[list, BeforeValidator(_object_list(SentimentModel, MAX_SENTIMENTS, "topic"))] = []
    topics: Annotated[list, BeforeValidator(_text_list(MAX_TOPICS, 60))] = []
    opinions_expressed: Annotated[list, BeforeValidator(_text_list(MAX_OPINIONS, 300))] = []
    concerns: Annotated[list, BeforeValidator(_text_list(MAX_CONCERNS, 300))] = []
    decisions: Annotated[list, BeforeValidator(_text_list(MAX_DECISIONS, 300))] = []
    follow_ups: Annotated[list, BeforeValidator(_object_list(FollowUpModel, MAX_FOLLOW_UPS, "description"))] = []

    @field_validator("primary_person", mode="before")
    @classmethod
    def _primary(cls, value: Any):
        # A non-object (the model wrote a string, or false) means "no
        # person" - the same as null, a standalone note.
        return value if isinstance(value, dict) else None


def sanitize(raw: Any) -> dict:
    """Validates and cleans an extraction result. Raises ValueError only if
    `raw` isn't a JSON object at all."""
    if not isinstance(raw, dict):
        raise ValueError("Extraction result was not a JSON object.")
    return ExtractedNote.model_validate(raw).model_dump()
