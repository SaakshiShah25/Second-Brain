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

import extraction
import llm_budget
from llm_client import FAST_MODEL_NAME

_SYSTEM_PROMPT = """You classify a message sent to a personal notes-and-tasks chat app as one of:

- "capture": the user is jotting something down - something that happened, a thought, a
  reminder, or a to-do. Written as a statement or narration, even if brief (e.g. "Met Priya
  today, she's excited about the demo", "Send the deck to Arjun by 6pm", "need to fix my sleep
  schedule", "idea: weekend trip to Goa"). A bare instruction with no "you"/"can you" is the
  user writing a to-do for THEMSELF, never a request to you - "Read chapter 5 of the bond book
  by Sunday", "Call mom tonight", "Book flights for Diwali", "Finish the IC memo" are all capture.
  So is adding to one of their lists or setting a reminder or a date: "Add Dune to my reading
  list", "Oppenheimer - must watch", "Milk and eggs for groceries", "Mom's birthday is 14 March",
  "Remind me to drink water every 2 hours", "Keep an eye on Tata Motors".
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

Many messages are voice transcripts: they often have NO question mark, end with a full stop, or are
slightly garbled. Judge by the wording, never by the punctuation: "To whom had I assigned the
scheduler.", "which tasks are pending", "did I send the invoice to Ravi" are all "ask", not to-dos.

If genuinely ambiguous between capture and ask, default to "capture" - a plain factual statement
with no question word or question word order is more likely a note being logged than a question being asked. If it is
ambiguous between capture and out_of_scope, ALWAYS choose "capture": saving a note the user
didn't want is harmless, refusing something they meant as a to-do loses their input. Only
classify as "out_of_scope" when the message is plainly a request to the assistant itself."""


# Phrasings aimed at an assistant. Bare verbs like "write", "tell", "draw" or
# "summarize" are left out on purpose: "Tell Rohan the demo moved", "Write the
# downside case", "Draw up the contract" are the user's own to-dos.
_ASSISTANT_REQUEST = re.compile(
    r"^\s*(please\s+)?(explain|generate|compose|translate|define|"
    r"(write|tell|give|show|make|help|teach|find|get) me|can you|could you|would you|will you|"
    r"what is|what are|what's|who is|who was|how do|how does|how to|how can|why is|why do|why does)\b"
    r"|\b(joke|poem|story|essay|lyrics|recipe|code snippet|python|javascript)\b",
    re.I,
)

_QUESTION = re.compile(r"^\s*(what|who|when|where|which|why|how|whom|whose)\b.*\?\s*$", re.I | re.S)

# A question recognised by its WORDING, because voice transcripts and quick typing often end without a "?" ("To whom
# had I assigned the scheduler task." was saved as a to-do). Each shape needs a question word together with what only a
# question does with it - an auxiliary verb after it, or "did I / is there" up front - so notes that merely start with
# those words ("When I reach, call Bob", "What we decided: ship Friday", "Have to call mom") are not caught.
_AUX = r"(?:did|do|does|is|are|was|were|am|have|has|had|will|would|should|can|could|shall)"
_LEAD_IN = re.compile(r"^(?:(?:hey|hi|ok|okay|so|and|also|um|uh|please|can you tell me|could you tell me|tell me|do you know|i want to know)\b[\s,]*)+", re.I)
_QUESTION_SHAPES = [re.compile(p, re.I) for p in (
    r"^(?:to|from|with|by|for|about)\s+whom\b(?!\s+it may)",                                                     # to whom had I...
    rf"^(?:to|from|with|by|for|about|on|at|in|of|since|till|until)\s+(?!what it\b)(?:what|which)\b(?:\s+\w+){{0,3}}?\s+{_AUX}\b",
    rf"^(?:who|whom|what|when|where|which|why|how)(?:\s+(?:all|else|exactly))?\s+(?!is why\b){_AUX}\b",   # when did I...
    r"^(?:what's|who's|when's|where's|how's|whats|whos)\b",
    rf"^(?:what|which|whose)(?:\s+[\w-]+){{1,2}}\s+{_AUX}\s+(?:i|we|my|there|due|pending|overdue|left|assigned)\b",  # which tasks are pending
    r"^who\s+(?:owns|handles|got|gets|took|takes|asked|said|sent|told|needs|owes)\b",
    r"^how\s+(?:many|much|long|often)\b",
    r"^(?:did|do|have|has|had|am|was|were|should|will)\s+(?:i|we)\b",                                  # did I assign...
    r"^(?:is|are|was|were)\s+(?:there|any|anything|my)\b",
    r"^(?:any|anything)\s+(?:tasks?|to-?dos?|pending|due|overdue|meetings?|reminders?)\b",
    r"^(?:show|list|read out|give me|find)(?:\s+me)?\s+(?:all\s+)?(?:of\s+)?(?:my|the\s+pending|pending|overdue)\b.*\b(?:tasks?|to-?dos?|notes?|reminders?|items?)\b",
)]


def asks_something(text: str) -> bool:
    """True when the message is worded as a question, with or without a question mark. Only a single sentence with no
    "label: detail" in it: anything longer or mixed is left to the model."""
    t = " ".join((text or "").replace("’", "'").split()).rstrip(" .?!")
    if not t or re.search(r"[.?!;]\s|:\s", t):
        return False
    stripped = _LEAD_IN.sub("", t)
    if stripped != t and re.search(r"(?i)\b(?:tell me|do you know|i want to know)\b", t[: len(t) - len(stripped)]):
        if re.match(r"(?i)(?:who|whom|what|when|where|which|how (?:many|much)|if|whether)\b", stripped):
            return True
    return any(shape.match(stripped) for shape in _QUESTION_SHAPES)


# A bare to-do verb at the start ("Understand how mutual funds work", "Call the bank by 5pm") is the
# user talking to themselves - a task or a goal - even when the topic sounds like general knowledge.
# Anything aimed at the assistant (tell me / explain / write me / can you ...) or phrased as a
# question is left to the model.
_SELF_TODO = re.compile(
    r"^\s*(please\s+)?(understand|learn|study|research|revise|review|explore|look\s+into|read\s+up|read|"
    r"figure\s+out|find\s+out|get|call|email|book|buy|send|finish|complete|schedule|check|submit|pay|renew|"
    r"fix|prepare|plan|set\s+up|follow\s+up|ask|share|update|upload|download|apply|register|attend|"
    r"organi[sz]e|clean|order|pick\s+up|print|sign|file|cancel|add|watch|wash|drink|remember)\b", re.I)
_ADDRESSED_TO_ASSISTANT = re.compile(r"\b(me|explain|can\s+you|could\s+you|would\s+you|you)\b|\?", re.I)


# Greetings and pleasantries ("hi", "what's up", "thanks", "ok", "good morning") are not notes: saving them filed
# "Hi ssup" as a note under Others. Recognised by code, before any model call, so they cost no tokens either.
_GREETING = {"hi", "hii", "hiii", "hello", "hellow", "hey", "heya", "hola", "yo", "sup", "ssup", "wassup", "whatsup", "wazzup", "howdy",
             "namaste", "hlo", "helo", "heyy", "heyyy", "gm", "morning", "afternoon", "evening", "good", "there", "all", "everyone", "again"}
_HOWAREYOU = {"how", "are", "r", "you", "u", "doing", "going", "it", "whats", "what's", "what", "up", "wsp", "da", "dear", "bro", "buddy", "friend"}
_THANKS = {"thanks", "thank", "thx", "ty", "tysm", "thankyou", "much", "so", "very", "a", "lot", "you", "u", "cool", "great", "nice", "awesome",
           "perfect", "sweet", "super", "wow", "ok", "okay", "k", "kk", "alright", "fine", "got", "it", "lol", "haha", "hmm", "hm", "yes", "yeah",
           "yep", "no", "nope", "sure", "bye", "goodbye", "cya", "see", "later", "gn", "night", "take", "care"}
_SMALLTALK_ALL = _GREETING | _HOWAREYOU | _THANKS
_FAREWELL = {"bye", "goodbye", "cya", "later", "gn", "night"}


def smalltalk_reply(text: str):
    """A friendly reply when the whole message is just a greeting or a pleasantry, else None (it goes the usual way).
    Strict on purpose: every word has to be one of these, so "Call you later" or "Thanks Priya for the deck" are not caught."""
    words = [w for w in re.sub(r"[^\w\s']", " ", (text or "").lower().replace("’", "'")).split() if w]
    if not words or len(words) > 6 or not all(w in _SMALLTALK_ALL for w in words):
        return None
    first = set(words)
    if first & _FAREWELL:
        return "See you! Whatever you want to remember, I'll be here."
    if first & {"thanks", "thank", "thx", "ty", "tysm", "thankyou", "cool", "great", "nice", "awesome", "perfect", "ok", "okay", "alright", "fine", "sure", "k", "kk"}:
        return "Anytime! Tell me something to remember, or ask about what you've logged."
    return "Hi! I keep your notes and to-dos. Tell me something to remember, or ask about what you've logged."


def fast_classify(text: str):
    """Free, deterministic routing for the obvious cases - each one skips
    an LLM call (~930 Groq tokens, measured) from a shared free-tier
    budget. Deliberately conservative: anything mixed or unusual returns
    None and goes to the model. Moderation still runs first regardless."""
    t = (text or "").strip()
    if not t or len(t) > 300:
        return None
    if _QUESTION.match(t) or asks_something(t):
        return "ask"
    if _SELF_TODO.match(t) and not _ADDRESSED_TO_ASSISTANT.search(t):
        return "capture"
    if extraction.quick_extract(t):  # "Movies: Dune, Oppenheimer" - an obvious list add
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
        # Refusing a real to-do ("Ask Priya for the report by Friday") is far
        # worse than saving an odd note, and the model does misread imperative
        # to-dos as requests. So "out of scope" only stands when the message
        # actually reads like a request to an assistant.
        if detected == "out_of_scope" and not _ASSISTANT_REQUEST.search(text):
            return "capture"
        return detected if detected in ("capture", "ask", "out_of_scope") else "capture"
    except Exception:
        return "capture"
