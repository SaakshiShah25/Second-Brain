"""
intent.py — Classifies a message from the unified chat as either "capture"
(a note about a conversation to log) or "ask" (a question about people/
past interactions). Used by api/routers/chat.py to route a single chat
input to the existing capture.py/retrieval.py flows automatically, so the
user doesn't have to pick "Log a note" vs "Ask a question" tabs manually -
they just type or talk, and the app figures out which one it is.
"""

import json

from llm_client import get_client, MODEL_NAME

_SYSTEM_PROMPT = """You classify a message sent to a personal-CRM chat app as either:

- "capture": the user is describing/recounting a conversation or meeting they just had with
  someone - who it was, what was discussed, decisions made, follow-ups. Written as a statement
  or narration, even if brief (e.g. "Met Priya today, she's excited about the demo", "Talked to
  Arjun, he wants a discount").
- "ask": the user is asking a question - about a specific person, a past interaction, an open
  follow-up, or searching for something discussed before (e.g. "What did Priya say about
  pricing?", "Who do I need to follow up with?", "Summarize my last call with Arjun", "When did
  I last talk to Rohan?").

Return ONLY valid JSON: {"intent": "capture" or "ask"}

If genuinely ambiguous, default to "capture" - a plain factual statement with no question is
more likely a note being logged than a question being asked."""


def classify(text: str) -> str:
    """Returns "capture" or "ask". Defaults to "capture" on any
    classification failure (matches the prompt's own ambiguity default) -
    a failed classification call shouldn't block the user's input from
    going anywhere."""
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
        return detected if detected in ("capture", "ask") else "capture"
    except Exception:
        return "capture"
