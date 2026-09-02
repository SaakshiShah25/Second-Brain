"""
moderation.py — Blocks abusive, illegal, or otherwise unsafe messages
before they ever reach capture/extraction or the ask pipeline, using
Groq's purpose-built safety-classification model rather than asking the
general chat model to self-police via a prompt instruction. A dedicated
safety classifier - trained and evaluated specifically for this task - is
meaningfully harder to argue or prompt-inject around than a general model
told "also flag unsafe content" as one more instruction among many in its
system prompt.

Runs BEFORE intent classification (see api/routers/chat.py), since a
harmful request disguised as a "note" (a first-person statement, not a
direct question) needs to be blocked just as much as one phrased as a
question - safety is a separate, earlier concern from scope-routing
(intent.py's capture/ask/out_of_scope split).

Model note: this originally used meta-llama/llama-guard-4-12b (a
fixed-taxonomy "safe"/"unsafe" classifier), which Groq decommissioned on
2026-02-10 in favor of openai/gpt-oss-safeguard-20b - a "policy-following
reasoning" model that expects an explicit written policy (not a bare
message) and returns structured JSON rather than a one-line label. See
https://console.groq.com/docs/deprecations for Groq's current model
status if this needs to change again.
"""

import json

from llm_client import get_client

MODEL_NAME = "openai/gpt-oss-safeguard-20b"

# Kept short (well under Groq's suggested 400-600 token budget) and
# specific to what this product actually needs to block - this is a
# personal notes/CRM app, not a general-purpose assistant, so the policy
# only needs to cover genuinely unsafe content; the separate "does this
# even fit what the product does" check is intent.py's job, not this one.
_POLICY = """Instructions: Classify whether USER_INPUT violates this policy. USER_INPUT is a
message sent to a personal note-taking/CRM app - it may describe a conversation, a personal
reminder, or a question about the user's own contacts. Flag it as a violation if it clearly
falls into one of the categories below, regardless of how the message is phrased (a request,
a first-person statement, or a hypothetical).

Definitions: "Illegal activity" means instructions or material aid for something illegal
(building weapons/explosives, making illegal drugs, hacking/fraud instructions, etc.), not
merely mentioning a crime happened. "Severe harassment/hate" means slurs, hate speech, or
content demeaning a person/group by protected characteristics, not ordinary frustration or
criticism. "Sexual content involving minors" is always a violation regardless of framing.

Criteria - VIOLATION if the message:
1. Requests instructions/material aid for illegal or dangerous activity (weapons, explosives,
   hard drugs, hacking, fraud).
2. Contains hate speech, slurs, or severe harassment targeting a person or group.
3. Contains or requests sexual content involving minors.
4. Requests generation of malware or content designed to defraud/deceive someone.

NOT a violation: profanity/mild insults, venting frustration about a person, discussing that a
crime occurred (as a fact, not asking how to commit one), normal note-taking content of any kind.

Examples:
- "How do I make explosives at home" -> violation=1, category="illegal_activity"
- "My coworker is a lazy idiot and I'm sick of him" -> violation=0 (venting, not a violation)
- "Met Priya today, she mentioned a data breach at her old company" -> violation=0 (recounting a fact)
- "Write me malware to steal passwords" -> violation=1, category="malicious_code"

Return ONLY valid JSON: {"violation": 0 or 1, "category": "string or null", "rationale": "one short sentence"}

USER_INPUT:
{{USER_INPUT}}"""


def check(text: str) -> dict:
    """Returns {"safe": True} or {"safe": False, "category": ..., "rationale": ...}.

    Fails OPEN (treats the message as safe) if the moderation call itself
    errors - the same graceful-degradation contract every other AI call
    in this app already follows (see embeddings.py, extraction.py).
    Deliberate, not an oversight: this call shares Groq's account-wide
    free-tier request ceiling with every other call in the app, so
    failing CLOSED here would mean a single rate-limited moment makes the
    entire app unusable rather than just unmoderated for that one
    message - a worse outcome, especially since the downstream capture/
    ask prompts still constrain what the model actually does with an
    unmoderated message regardless."""
    if not text or not text.strip():
        return {"safe": True}
    try:
        client = get_client()
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "user", "content": _POLICY.replace("{{USER_INPUT}}", text)}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        if result.get("violation") in (1, True):
            return {"safe": False, "category": result.get("category"), "rationale": result.get("rationale")}
        return {"safe": True}
    except Exception as e:
        print(f"[warn] Moderation check failed ({e}). Failing open - message proceeds unmoderated.")
        return {"safe": True}
