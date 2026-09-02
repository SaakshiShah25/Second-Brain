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

from llm_client import get_client, MODEL_NAME

_SYSTEM_PROMPT = """You classify a message sent to a personal-CRM chat app as one of:

- "capture": the user is describing/recounting a conversation or meeting they just had with
  someone - who it was, what was discussed, decisions made, follow-ups. Written as a statement
  or narration, even if brief (e.g. "Met Priya today, she's excited about the demo", "Talked to
  Arjun, he wants a discount"). Also covers a personal task/reminder/idea with no one else
  involved (e.g. "need to fix my sleep schedule").
- "ask": the user is asking a question about THEIR OWN logged data - a specific person, a past
  interaction, an open follow-up, or searching for something discussed before (e.g. "What did
  Priya say about pricing?", "Who do I need to follow up with?", "Summarize my last call with
  Arjun", "When did I last talk to Rohan?").
- "out_of_scope": the user is asking for something a general-purpose chat assistant does, with
  no connection to their own logged notes/contacts/tasks - a joke, a story, a poem, code, an
  image, general trivia or how-to knowledge, or anything else this product isn't built to do.
  This app is a personal memory/CRM tool, not a general assistant - if the request doesn't
  involve logging a note, a personal reminder, or recalling something the user themselves
  logged, it's out_of_scope, even if it's phrased politely or as a simple favor.

Return ONLY valid JSON: {"intent": "capture" or "ask" or "out_of_scope"}

If genuinely ambiguous between capture and ask, default to "capture" - a plain factual statement
with no question is more likely a note being logged than a question being asked. Only classify
as "out_of_scope" when you're confident the request has nothing to do with the user's own
notes/contacts/tasks - don't use it just because a message is short or informal."""


def classify(text: str) -> str:
    """Returns "capture", "ask", or "out_of_scope". Defaults to "capture"
    on any classification failure or an unrecognized value (matches the
    prompt's own ambiguity default) - a failed classification call
    shouldn't block the user's input from going anywhere, and failing
    toward "capture" rather than "out_of_scope" means a hiccup here never
    incorrectly refuses a legitimate note."""
    if not text or not text.strip():
        return "capture"
    try:
        client = get_client()
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        detected = result.get("intent")
        return detected if detected in ("capture", "ask", "out_of_scope") else "capture"
    except Exception:
        return "capture"
