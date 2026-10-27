"""
intent.py — Classifies a message from the unified chat as "capture" (a
note or to-do to log), "ask" (a question about the user's own notes and
tasks), or "out_of_scope" (a general-purpose request unrelated to the
product - a joke, a story, code, trivia - the kind of thing any
general chat assistant would do, which this one deliberately doesn't).
Used by api/routers/chat.py to route a single chat input to the existing
capture / agent flows automatically, so the user doesn't have to pick
"Log a note" vs "Ask a question" tabs manually - they just type or talk,
and the app figures out which one it is (or that it's neither).

Note: this is a SCOPE check, not a SAFETY check - it decides "is this
something our product does," not "is this harmful." Safety/abuse
filtering happens earlier, in moderation.py, before this ever runs.
"""

import json
import re

import llm_budget
from llm_client import FAST_MODEL_NAME

_SYSTEM_PROMPT = """You classify a message sent to a personal notes-and-tasks chat app as one of:

- "capture": the user is jotting something down - something that happened, a thought, a
  reminder, or a to-do. Written as a statement or narration, even if brief (e.g. "Met Priya
  today, she's excited about the demo", "Send the deck to Arjun by 6pm", "need to fix my sleep
  schedule", "idea: weekend trip to Goa").
- "ask": the user is asking a question about THEIR OWN logged notes or tasks, or searching for
  something they wrote down before (e.g. "What did I note about pricing?", "What's overdue?",
  "What do I need to do this week?", "When did I last talk to Rohan?").
- "out_of_scope": the user is asking for something a general-purpose chat assistant does, with
  no connection to their own logged notes/tasks - a joke, a story, a poem, code, an image,
  general trivia or how-to knowledge, or anything else this product isn't built to do. This app
  is a personal notes-and-tasks tool, not a general assistant - if the request doesn't involve
  logging a note, a reminder, or recalling something the user themselves logged, it's
  out_of_scope, even if it's phrased politely or as a simple favor.

Return ONLY valid JSON: {"intent": "capture" or "ask" or "out_of_scope"}

If genuinely ambiguous between capture and ask, default to "capture" - a plain factual statement
with no question is more likely a note being logged than a question being asked. Only classify
as "out_of_scope" when you're confident the request has nothing to do with the user's own
notes/tasks - don't use it just because a message is short or informal."""


_QUESTION = re.compile(r"^\s*(what|who|when|where|which|why|how|whom|whose)\b.*\?\s*$", re.I | re.S)


def fast_classify(text: str):
    """Free, deterministic routing for the obvious cases - each one skips
    an LLM call (~930 Groq tokens, measured) from a shared free-tier
    budget. Deliberately conservative: anything mixed or unusual returns
    None and goes to the model. Moderation still runs first regardless."""
    t = (text or "").strip()
    if not t or len(t) > 300:
        return None
    if _QUESTION.match(t):
        return "ask"
    return None


def classify(text: str) -> str:
    """Returns "capture", "ask", or "out_of_scope". Defaults to "capture"
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
        return detected if detected in ("capture", "ask", "out_of_scope") else "capture"
    except Exception:
        return "capture"
