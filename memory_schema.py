"""
memory_schema.py - The vocabulary and the cleaning rules for what the app
REMEMBERS about people (schema.sql section 31: person_fact, relationship,
key_date). Pure functions only - no database, no model - so every rule here
can be tested on its own (tests/test_memory_schema.py).

Division of labour, same as everywhere else in this app: the LLM reads the
note and proposes items in a fixed vocabulary ("Birthday", month 3, day 14;
"likes", "coffee over tea"); the rules HERE decide what is valid, what the
canonical form is, what is single-valued, and what is sensitive. Calendar
arithmetic (relative phrases, "days until the next birthday", Feb 29) is also
done here, never by the model.
"""

import calendar
import re
from datetime import date
from typing import Optional

import date_utils

# ---------------------------------------------------------------- facts

# attribute -> (single_valued, sensitive)
#   single_valued: a new value SUPERSEDES the current one (a person lives in
#     one city at a time); multi-valued attributes accumulate (likes, hobbies).
#   sensitive: flagged (`is_sensitive`) so anything that summarises a person
#     can leave it out, and never copied into the plain `value_norm` column
#     used for exact-match filtering.
FACT_ATTRIBUTES = {
    # profile basics (also kept on the person row for the existing screens)
    "role": (True, False),
    "company": (True, False),
    "phone": (True, False),
    "email": (True, False),
    "trait": (False, False),
    "personal": (False, False),        # legacy free-text personal detail
    "relation_to_me": (True, False),   # "my mom", "a friend from college"
    # what the extractor can now pin down about a person
    "likes": (False, False),
    "dislikes": (False, False),
    "hobby": (False, False),
    "diet": (True, False),
    "allergy": (False, False),
    "health": (False, True),
    "lives_in": (True, False),
    "hometown": (True, False),
    "education": (False, False),
    "language": (False, False),
    "pet": (False, False),
    "goal": (False, False),
    "life_event": (False, False),
    "other": (False, False),
}

# Words the model (or a person) might use for an attribute -> our name.
_ATTRIBUTE_SYNONYMS = {
    "like": "likes", "favourite": "likes", "favorite": "likes", "loves": "likes", "preference": "likes",
    "preferences": "likes", "prefers": "likes", "dislike": "dislikes", "hates": "dislikes",
    "hobbies": "hobby", "interest": "hobby", "interests": "hobby", "pastime": "hobby",
    "diet": "diet", "dietary": "diet", "vegetarian": "diet", "food_preference": "diet",
    "allergies": "allergy", "medical": "health", "condition": "health", "illness": "health",
    "city": "lives_in", "location": "lives_in", "lives": "lives_in", "resides": "lives_in", "based_in": "lives_in",
    "home_town": "hometown", "from": "hometown", "school": "education", "college": "education",
    "university": "education", "alma_mater": "education", "degree": "education",
    "languages": "language", "pets": "pet", "goals": "goal", "plan": "goal", "plans": "goal",
    "event": "life_event", "milestone": "life_event", "job_title": "role", "title": "role",
    "organization": "company", "employer": "company", "workplace": "company",
    "traits": "trait", "personality": "trait",
}

SUBJECTS = {"self", "spouse", "child", "parent", "sibling", "pet", "other"}
CONFIDENCES = {"stated", "likely"}

MAX_VALUE_CHARS = 200
MAX_NAME_CHARS = 80
MAX_FACTS_PER_PERSON = 10   # per note
MAX_DATES_PER_PERSON = 5    # per note


def _squash(text) -> str:
    return " ".join(str(text or "").split())


def normalise_attribute(raw) -> str:
    key = _squash(raw).lower().replace(" ", "_").replace("-", "_")
    if key in FACT_ATTRIBUTES:
        return key
    return _ATTRIBUTE_SYNONYMS.get(key, "other")


def is_single_valued(attribute: str) -> bool:
    return FACT_ATTRIBUTES.get(attribute, (False, False))[0]


def is_sensitive(attribute: str) -> bool:
    return FACT_ATTRIBUTES.get(attribute, (False, False))[1]


def value_norm(value: str) -> str:
    """Lower-case, punctuation-free form used to spot 'the same fact again'
    and to filter ('vegetarian'). Letters and digits only."""
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def clean_subject(raw_subject, raw_name=None) -> tuple:
    """(subject, subject_name). Whom a fact or date is about: the person
    themself ('self') or someone in their family ('child', 'Anya')."""
    subject = _squash(raw_subject).lower()
    name = _squash(raw_name)[:MAX_NAME_CHARS] or None
    if subject in ("me", "they", "he", "she", "them", "person", ""):
        subject = "self"
    if subject in ("wife", "husband", "partner"):
        subject = "spouse"
    elif subject in ("son", "daughter", "kid"):
        subject = "child"
    elif subject in ("mother", "father", "mom", "dad"):
        subject = "parent"
    elif subject in ("brother", "sister"):
        subject = "sibling"
    if subject not in SUBJECTS:
        subject = "other"
    if subject == "self":
        name = None
    return subject, name


_MOVE = re.compile(
    r"(?i:\b(?:moved|moving|shifted|shifting|relocated|relocating|settled|settling)\s+(?:back\s+)?(?:to|into|in))"
    r"\s+([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)*)")


def move_destination(text) -> Optional[str]:
    """'moved to Bangalore' / 'shifted to New Delhi last year' -> 'Bangalore' /
    'New Delhi'. Only a capitalised place counts ('moved to a new house' is not a
    city), so a milestone that merely contains 'moved' is left alone."""
    match = _MOVE.search(str(text or ""))
    return _squash(match.group(1)) if match else None


_MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}
_TURNS = re.compile(r"(?i)\bturn(?:s|ed|ing)?\s+\d{1,3}\s+(?:in|on)\s+(" + "|".join(_MONTHS) + r")\b(?:\s+(\d{1,2}))?")


def birthday_from_age_milestone(text) -> Optional[dict]:
    """'turns 5 in June' / 'turning 40 on March 3' -> {"month": 6, "day": None}.
    A birthday said as an age milestone is still a birthday: month known, day only if given."""
    match = _TURNS.search(str(text or ""))
    if not match:
        return None
    day = int(match.group(2)) if match.group(2) else None
    month = _MONTHS[match.group(1).lower()]
    return {"month": month, "day": day if day and _valid_month_day(month, day) else None}


def clean_fact(raw) -> Optional[dict]:
    """One extracted fact -> the stored shape, or None if it carries nothing.
    Accepts {"attribute","value","subject","subject_name","confidence"}."""
    if not isinstance(raw, dict):
        return None
    value = _squash(raw.get("value"))[:MAX_VALUE_CHARS]
    if not value:
        return None
    attribute = normalise_attribute(raw.get("attribute"))
    # Moving house is not a one-off "life event": it changes where they LIVE,
    # which is a single-valued fact whose old values must stay as a timeline.
    # The model files it either way ("moved to Bangalore" as a life event one
    # time, as "lives in" the next), so this makes it consistent.
    if attribute in ("life_event", "lives_in"):
        place = move_destination(value)
        if place:
            attribute, value = "lives_in", place[:MAX_VALUE_CHARS]
    subject, subject_name = clean_subject(raw.get("subject"), raw.get("subject_name"))
    confidence = _squash(raw.get("confidence")).lower()
    sensitive = is_sensitive(attribute)
    return {
        "attribute": attribute,
        "value": value,
        "value_norm": None if sensitive else (value_norm(value) or None),
        "subject": subject,
        "subject_name": subject_name,
        "confidence": confidence if confidence in CONFIDENCES else "stated",
        "is_sensitive": sensitive,
    }


def clean_facts(raw_list, limit: int = MAX_FACTS_PER_PERSON) -> list:
    """A whole extracted list: cleaned, de-duplicated, capped."""
    out, seen = [], set()
    for raw in raw_list if isinstance(raw_list, list) else []:
        fact = clean_fact(raw)
        if not fact:
            continue
        key = (fact["attribute"], fact["subject"], (fact["subject_name"] or "").lower(), value_norm(fact["value"]))
        if key in seen:
            continue
        seen.add(key)
        out.append(fact)
        if len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------- key dates

DATE_TYPES = ("birthday", "anniversary", "custom")
_MAX_LABEL = 60
_DEFAULT_LABEL = {"birthday": "Birthday", "anniversary": "Anniversary"}


def _valid_month_day(month, day) -> bool:
    if isinstance(month, bool) or isinstance(day, bool):
        return False
    if not isinstance(month, int) or not isinstance(day, int):
        return False
    try:
        date(2000, month, day)  # 2000 is a leap year, so Feb 29 is legal
        return True
    except ValueError:
        return False


def _as_int(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def infer_date_type(kind, label) -> str:
    text = f"{kind or ''} {label or ''}".lower()
    if "birth" in text or "bday" in text:
        return "birthday"
    if "anniversar" in text or "wedding" in text:
        return "anniversary"
    return "custom"


def clean_key_date(raw, reference_date: Optional[date] = None) -> Optional[dict]:
    """One extracted date -> the stored shape, or None when it isn't a real
    recurring date. A relative `when` ('tomorrow', 'next Friday') is resolved
    against `reference_date` (the date the note is about) and only its
    month/day kept. A month with no day is allowed (stored as approximate:
    'turns 5 in June') - never an invented day."""
    if not isinstance(raw, dict):
        return None
    label = _squash(raw.get("label"))[:_MAX_LABEL]
    date_type = raw.get("date_type") if raw.get("date_type") in DATE_TYPES else \
        infer_date_type(raw.get("kind") or raw.get("date_type"), label)
    subject, subject_name = clean_subject(raw.get("subject"), raw.get("subject_name"))

    month, day, year = _as_int(raw.get("month")), _as_int(raw.get("day")), _as_int(raw.get("year"))
    if month is not None and day is not None and _valid_month_day(month, day):
        pass
    elif month is not None and 1 <= month <= 12 and day is None:
        pass  # month only: approximate
    else:
        resolved = date_utils.resolve_relative_phrase(raw.get("when"), reference_date)
        if not resolved:
            return None
        resolved_date = date.fromisoformat(resolved)
        month, day = resolved_date.month, resolved_date.day

    if date_type == "anniversary" and subject == "self":
        subject = "spouse"  # an anniversary is shared: "their wedding anniversary" is with their spouse

    this_year = (reference_date or date.today()).year
    if year is not None and not (1900 <= year <= this_year):
        year = None  # an implausible year is dropped, the date itself is kept
    if date_type == "custom" and not label:
        return None  # a custom date needs a name to mean anything
    if not label:
        label = _DEFAULT_LABEL[date_type]
    return {
        "date_type": date_type, "label": label, "subject": subject, "subject_name": subject_name,
        "month": month, "day": day, "year": year,
    }


def clean_key_dates(raw_list, reference_date: Optional[date] = None, limit: int = MAX_DATES_PER_PERSON) -> list:
    out, seen = [], set()
    for raw in raw_list if isinstance(raw_list, list) else []:
        item = clean_key_date(raw, reference_date)
        if not item:
            continue
        key = (item["date_type"], item["subject"], (item["subject_name"] or "").lower(),
               item["month"], item["day"], item["label"].lower() if item["date_type"] == "custom" else "")
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= limit:
            break
    return out


def next_occurrence(month: int, day: Optional[int], today: Optional[date] = None) -> Optional[date]:
    """The next calendar date (today included) this yearly date falls on.
    Feb 29 is observed on Feb 28 in a non-leap year. None for month-only."""
    if day is None:
        return None
    today = today or date.today()
    for year in (today.year, today.year + 1):
        d = day
        if month == 2 and day == 29 and not calendar.isleap(year):
            d = 28
        candidate = date(year, month, d)
        if candidate >= today:
            return candidate
    return None


def occurrence_in_year(month: int, day: int, year: int) -> date:
    """The calendar date a yearly date falls on in `year` (Feb 29 -> Feb 28 in a non-leap year)."""
    if month == 2 and day == 29 and not calendar.isleap(year):
        day = 28
    return date(year, month, day)


def days_until(month: int, day: Optional[int], today: Optional[date] = None) -> Optional[int]:
    today = today or date.today()
    nxt = next_occurrence(month, day, today)
    return (nxt - today).days if nxt else None


def describe_key_date(item: dict, today: Optional[date] = None) -> str:
    """'Birthday: 14 March (in 12 days)' / "Anya's birthday: June (day not known)"."""
    today = today or date.today()
    who = item.get("subject_name")
    if item.get("subject") == "spouse" and item.get("date_type") == "anniversary":
        who = None  # it is shared by the two of them: "Wedding anniversary", not "Karan's"
    label = item.get("label") or item.get("date_type") or "Date"
    if who and who.lower() not in label.lower():
        label = f"{who}'s {label[0].lower() + label[1:]}" if label else who
    month, day = item["month"], item.get("day")
    month_name = calendar.month_name[month]
    when = f"{day} {month_name}" if day else f"{month_name} (day not known)"
    if item.get("year") and item.get("date_type") == "birthday" and day:
        when += f", born {item['year']}"
    left = days_until(month, day, today)
    if left is None:
        return f"{label}: {when}"
    if left == 0:
        tail = "today"
    elif left == 1:
        tail = "tomorrow"
    else:
        tail = f"in {left} days"
    return f"{label}: {when} ({tail})"


# ---------------------------------------------------------------- relationships

REL_TYPES = ("spouse", "parent", "child", "sibling", "relative", "friend", "colleague", "other")

# What the OTHER person is to the one the note is about, as seen from the other
# person: "Priya's mom" -> parent (the mom IS A parent OF Priya).
_SPOUSE = re.compile(r"\b(wife|husband|spouse|partner|fianc[eé]e?|girlfriend|boyfriend|married to)\b", re.I)
_PARENT = re.compile(r"\b(mother|mom|mum|mummy|mama|father|dad|daddy|papa|parents?|step-?(mother|father))\b", re.I)
_CHILD = re.compile(r"\b(son|daughter|child|children|kids?|baby)\b", re.I)
_SIBLING = re.compile(r"\b(sister|brother|sibling|twin)\b", re.I)
_RELATIVE = re.compile(r"\b(cousin|aunt|auntie|uncle|niece|nephew|grand(mother|father|ma|pa|parent|son|daughter|child)"
                       r"|in-law|relative|family)\b", re.I)
_FRIEND = re.compile(r"\b(friend|buddy|classmate|roommate|neighbou?r|schoolmate)\b", re.I)
_WORK = re.compile(r"\b(colleague|co-?worker|manager|boss|reports? to|team(mate)?|cto|ceo|cfo|coo|founder|"
                   r"co-?founder|director|vp|head of|lead|engineer|recruiter|client|customer|vendor|partner at|"
                   r"works? (with|at|for)|mentor)\b", re.I)

INVERSE_REL_TYPE = {"spouse": "spouse", "parent": "child", "child": "parent", "sibling": "sibling",
                    "relative": "relative", "friend": "friend", "colleague": "colleague", "other": "other"}

# the coarse `rel` stored beside rel_type (what graph.py and older rows use)
REL_GROUP = {"spouse": "family", "parent": "family", "child": "family", "sibling": "family",
             "relative": "family", "friend": "friend", "colleague": "colleague", "other": "related_to"}


def rel_type_of(label) -> str:
    text = str(label or "")
    for pattern, rel_type in ((_SPOUSE, "spouse"), (_PARENT, "parent"), (_CHILD, "child"), (_SIBLING, "sibling"),
                              (_RELATIVE, "relative"), (_FRIEND, "friend"), (_WORK, "colleague")):
        if pattern.search(text):
            return rel_type
    return "other"


def rel_group_of(label) -> str:
    return REL_GROUP[rel_type_of(label)]
