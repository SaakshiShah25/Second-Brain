"""
intent.py — Classifies a message from the unified chat as "capture" (a
note about a conversation to log), "ask" (a question about the user's own
people/past interactions), or "out_of_scope" (a general-purpose request
unrelated to the product - a joke, a story, code, trivia - the kind of
thing any general chat assistant would do, which this one deliberately
doesn't). Used by api/routers/chat.py to route a single chat input to the
existing capture.py/retrieval.py flows automatically, so the user doesn't
have to pick "Log a note" vs "Ask a question" tabs manually - they just
type or talk, and the app figures out which one it is (or that it's
neither).

Note: this is a SCOPE check, not a SAFETY check - it decides "is this
something our product does," not "is this harmful." Safety/abuse
filtering happens earlier, in moderation.py, before this ever runs.
"""

import json
import re

import llm_budget
from llm_client import FAST_MODEL_NAME

_SYSTEM_PROMPT = """You classify a message sent to a personal-CRM chat app as one of:

- "capture": the user is describing/recounting a conversation or meeting they just had with
  someone - who it was, what was discussed, decisions made, follow-ups. Written as a statement
  or narration, even if brief (e.g. "Met Priya today, she's excited about the demo", "Talked to
  Arjun, he wants a discount"). Also covers a personal task/reminder/idea with no one else
  involved (e.g. "need to fix my sleep schedule").
- "ask": the user is asking a question about THEIR OWN logged data - a specific person, a past
  interaction, an open follow-up, or searching for something discussed before (e.g. "What did
  Priya say about pricing?", "Who do I need to follow up with?", "Summarize my last call with
  Arjun", "When did I last talk to Rohan?"). This also covers forward-looking prep questions
  about a specific named person - "What should I talk to Sunil about?", "Any prep tips before I
  meet Priya?", "What should I bring up with Arjun?" - these still need the person's past
  interactions to answer well (open follow-ups, unresolved concerns, last topics discussed), so
  they're "ask", not "out_of_scope", even though they're phrased as asking for advice rather than
  asking what was literally said.
- "documents": the user wants to FIND, PULL UP, SEND, SHARE or GATHER files they've stored in the
  app's document organizer - IDs, photos, statements, certificates, contracts, decks, invoices,
  tickets (e.g. "pull my aadhaar and photo", "send me the Acme contract", "I need my passport and
  PAN", "get Mum's Aadhaar", "documents for my Schengen visa", "share last 3 salary slips"). It's
  about retrieving a FILE, not recalling what someone said - "what did Priya say about the
  contract?" is "ask", "pull up the Acme contract" is "documents". If ONE message both asks a
  question AND wants files ("what did Neha want, and send me the Acme contract"), choose "ask" -
  that path can also fetch files.
- "out_of_scope": the user is asking for something a general-purpose chat assistant does, with
  no connection to their own logged notes/contacts/tasks - a joke, a story, a poem, code, an
  image, general trivia or how-to knowledge, or anything else this product isn't built to do.
  This app is a personal memory/CRM tool, not a general assistant - if the request doesn't
  involve logging a note, a personal reminder, or recalling something the user themselves
  logged, it's out_of_scope, even if it's phrased politely or as a simple favor.

Return ONLY valid JSON: {"intent": "capture" or "ask" or "documents" or "out_of_scope"}

If genuinely ambiguous between capture and ask, default to "capture" - a plain factual statement
with no question is more likely a note being logged than a question being asked. Only classify
as "out_of_scope" when you're confident the request has nothing to do with the user's own
notes/contacts/tasks - don't use it just because a message is short or informal."""


_DOC_VERB = re.compile(r"^\s*(please\s+)?(pull|send|share|get|fetch|show|find|open|give)(\s+me)?(\s+up)?\b", re.I)
_DOC_NOUN = re.compile(
    r"\b(aadhaar|aadhar|pan( card)?|passport|licen[cs]e|statements?|slips?|payslips?|itr|contract|agreement|nda|msa|sow|"
    r"invoices?|decks?|resume|cv|certificates?|polic(y|ies)|tickets?|bills?|photos?|documents?|docs?|files?|pdfs?|"
    r"insurance|report|receipts?|visa)\b", re.I)
_QUESTION = re.compile(r"^\s*(what|who|when|where|which|why|how|whom|whose)\b.*\?\s*$", re.I | re.S)


def fast_classify(text: str):
    """Free, deterministic routing for the obvious cases - each one skips
    an LLM call (~930 Groq tokens, measured) from a shared free-tier
    budget. Deliberately conservative: anything mixed or unusual returns
    None and goes to the model. Moderation still runs first regardless."""
    t = (text or "").strip()
    if not t or len(t) > 300:
        return None
    if _DOC_VERB.search(t) and _DOC_NOUN.search(t) and "?" not in t \
            and not re.search(r"\b(what|who|when|why|how|tell me)\b", t, re.I):
        return "documents"
    if _QUESTION.match(t):
        return "ask"
    return None


def classify(text: str) -> str:
    """Returns "capture", "ask", "documents", or "out_of_scope". Defaults to "capture"
    on any classification failure or an unrecognized value (matches the
    prompt's own ambiguity default) - a failed classification call
    shouldn't block the user's input from going anywhere, and failing
    toward "capture" rather than "out_of_scope" means a hiccup here never
    incorrectly refuses a legitimate note."""
    if not text or not text.strip():
        return "capture"
    fast = fast_classify(text)
    if fast:
        return fast
    try:
        response = llm_budget.chat(FAST_MODEL_NAME, reasoning_effort="low",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        detected = result.get("intent")
        return detected if detected in ("capture", "ask", "documents", "out_of_scope") else "capture"
    except Exception:
        return "capture"
