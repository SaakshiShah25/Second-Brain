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
  schedule", "idea: weekend trip to Goa"). A bare instruction with no "me"/"you" in it is the
  user talking to THEMSELVES - a to-do or a goal - not a request to the assistant, however
  general the topic: "Understand how mutual funds work", "Learn Spanish", "Research health
  insurance options", "Read up on index funds", "Get access to the repo by EOD", "Call the
  bank". These are all "capture".
- "ask": the user is asking a question about THEIR OWN logged notes or tasks, or searching for
  something they wrote down before (e.g. "What did I note about pricing?", "What's overdue?",
  "What do I need to do this week?", "When did I last talk to Rohan?").
- "out_of_scope": the message is clearly ADDRESSED TO THE ASSISTANT, asking it to produce or
  explain something a general-purpose chat assistant does, with no connection to the user's own
  notes/tasks: "tell me a joke", "write me a poem", "write a python function", "explain how
  mutual funds work", "what is the capital of France", "can you give me a recipe". The tell is
  a request aimed at the assistant (tell me / explain / write me / give me / can you / what is /
  how do I ...). This app is a personal notes-and-tasks tool, not a general assistant.

Return ONLY valid JSON: {"intent": "capture" or "ask" or "out_of_scope"}

If genuinely ambiguous between capture and ask, default to "capture" - a plain factual statement
with no question is more likely a note being logged than a question being asked. If it is
ambiguous between capture and out_of_scope, ALWAYS choose "capture": saving a note the user
didn't want is harmless, refusing something they meant as a to-do loses their input. Only
classify as "out_of_scope" when the message is plainly a request to the assistant itself."""


_QUESTION = re.compile(r"^\s*(what|who|when|where|which|why|how|whom|whose)\b.*\?\s*$", re.I | re.S)

# A bare to-do verb at the start ("Understand how mutual funds work", "Call the bank by 5pm") is the
# user talking to themselves - a task or a goal - even when the topic sounds like general knowledge.
# Anything aimed at the assistant (tell me / explain / write me / can you ...) or phrased as a
# question is left to the model.
_SELF_TODO = re.compile(
    r"^\s*(please\s+)?(understand|learn|study|research|revise|review|explore|look\s+into|read\s+up|read|"
    r"figure\s+out|find\s+out|get|call|email|book|buy|send|finish|complete|schedule|check|submit|pay|renew|"
    r"fix|prepare|plan|set\s+up|follow\s+up|ask|share|update|upload|download|apply|register|attend|"
    r"organi[sz]e|clean|order|pick\s+up|print|sign|file|cancel)\b", re.I)
_ADDRESSED_TO_ASSISTANT = re.compile(r"\b(me|explain|can\s+you|could\s+you|would\s+you|you)\b|\?", re.I)


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
    if _SELF_TODO.match(t) and not _ADDRESSED_TO_ASSISTANT.search(t):
        return "capture"
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
