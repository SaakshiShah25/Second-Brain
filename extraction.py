"""
extraction.py — Turns a raw narrated/typed note into structured JSON
using Groq's free-tier LLM API (fast + free Llama models).

Get a free API key at: https://console.groq.com/keys
Then set it as an environment variable:
    export GROQ_API_KEY="your_key_here"
"""

import json
from datetime import date

from llm_client import get_client, MODEL_NAME


def _build_system_prompt(reference_date: str, reference_weekday: str) -> str:
    # The reference date is injected dynamically so the model has an anchor
    # to resolve relative expressions ("today", "yesterday", "by Friday")
    # into absolute ISO dates. Without this the model has no idea what
    # "today" means and correctly returns null for everything relative.
    return f"""You are an information-extraction engine for a personal memory app.
Given a raw note describing a conversation or interaction the user had with one or more people,
extract structured information.

Today's date is {reference_date} ({reference_weekday}).

IMPORTANT - for date/time references anchored to a WEEKDAY or to
"today"/"tomorrow"/"yesterday" (e.g. "next Monday", "last Thursday", "by Friday",
"this Wednesday"), do NOT calculate the resulting calendar date yourself - weekday
arithmetic is handled in code instead, since it's error-prone to compute by hand.
Just output the phrase normalized to one of: "today", "tomorrow", "yesterday",
"next <weekday>", "last <weekday>", "this <weekday>", or a bare "<weekday>" with no
qualifier (e.g. plain "Friday", meaning the upcoming one) - using the weekday name
and qualifier exactly as the note implies (e.g. "he'll get back to us by next
Monday" -> "next Monday"; "met him last Thursday" -> "last Thursday").

For anything else - an explicit date the note states outright (e.g. "August 20th"),
or a loose/vague timeframe (e.g. "sometime next month", "in a couple weeks") -
resolve it yourself into an absolute YYYY-MM-DD using today's date above as your
anchor. If no date/time reference is present at all, leave the relevant field null -
do not guess.

CRITICAL: every date field must be either a COMPLETE date (YYYY-MM-DD), one of the
normalized relative phrases described above, or null - NEVER a partial date like a
year-month only (e.g. "2026-09"). If the note only vaguely mentions a month or a
loose timeframe without a specific day and it doesn't fit a normalized phrase, pick
a single reasonable specific day within that period (e.g. the 1st of that month)
rather than leaving the date partial. Only use null when there is truly no time
reference at all.

Return ONLY valid JSON (no markdown fences, no preamble) matching this exact schema:

{{
  "primary_person": {{
    "name": "string - the main person's name as mentioned, or 'Unknown' if unclear",
    "aliases": ["any nicknames/short forms used"],
    "description": "string - GENERAL, stable, PROFESSIONALLY-OBSERVABLE traits only: physical appearance (e.g. build, hair, glasses) and personality/demeanor (e.g. funny, sincere, analytical, reserved) that would still be true the next time you meet them. Do NOT include their job title or company here - those go in separate fields below. Do NOT include personal-life details (family, hobbies, interests, life events) - those go in 'personal_notes' below instead. Do NOT include a reaction or emotion about a specific thing discussed in THIS meeting (e.g. 'excited about the pricing change', 'skeptical about the timeline') - that is not a stable trait, it belongs in the 'sentiments' field below instead, tied to its specific topic. Empty string if nothing is mentioned. Do not invent traits that aren't stated or clearly implied.",
    "role": "string - their job title/role if mentioned (e.g. 'Procurement Manager'), else empty string",
    "company": "string - their company/organization if mentioned, else empty string",
    "personal_notes": "string - PERSONAL, non-professional details mentioned about them: family, hobbies/interests, alma mater, life events, upcoming personal plans (e.g. 'has two kids', 'into cycling on weekends', 'went to Stanford'). Kept separate from 'description' above, which is professional/stable demeanor and appearance only. Empty string if nothing personal was mentioned."
  }},
  "other_people": [
    {{
      "name": "string - the other person's name as mentioned",
      "relation": "string - how this person relates to the primary person and/or to the user, stated or clearly implied in the note (e.g. 'Priya's sister', 'Rohan's colleague, might join the next call'). Empty string if the note gives no indication of the relationship - do not guess.",
      "present": "boolean - true ONLY if this person actually took part in THIS specific meeting/conversation (e.g. joined the call, was physically there, spoke). false if they were merely mentioned/referenced by the primary person without being present themselves (e.g. 'his colleague Priya, who handles onboarding' - Priya wasn't on the call). Default to false when it's unclear - only mark true when the note clearly indicates they participated."
    }}
  ],
  "date_mentioned": "string - when this interaction happened, per the date-phrase rules above (a normalized relative phrase like 'today'/'last Thursday', or an explicit YYYY-MM-DD if the note states/implies one outright). Null only if the note gives no time reference at all.",
  "location": "string - location mentioned, else null",
  "appearance_this_meeting": "string - what the person was WEARING or looked like SPECIFICALLY at this particular meeting/interaction (e.g. 'wore a blue shirt and blazer'), as opposed to their general stable appearance. Empty string if nothing meeting-specific was mentioned.",
  "meeting_type": "string - the TYPE of this meeting/interaction. Must be one of: 'discovery', 'demo', 'negotiation', 'check-in', 'networking', 'contract', 'support', 'internal', 'other'. Always pick the closest fit from context (e.g. a first exploratory call is 'discovery', a casual run-in at an event is 'networking') - use 'other' only if genuinely nothing fits, never leave this blank.",
  "summary": "string - a concise 1-3 sentence summary of what happened/was discussed",
  "sentiments": [
    {{
      "topic": "string - the specific subject this sentiment is about, e.g. 'pricing'",
      "sentiment": "string - the person's reaction/attitude toward that specific topic, e.g. 'skeptical'"
    }}
  ],
  "topics": ["short list of topic keywords discussed"],
  "opinions_expressed": ["notable opinions or statements the person made, as short phrases"],
  "concerns": ["specific objections, concerns, or hesitations the person raised, each as a SELF-CONTAINED sentence (e.g. 'Concerned about the 12-month contract length', 'Worried onboarding will take too long given their team size'). Distinct from 'sentiments' above (which are general topic-level reactions) - these are specific issues worth proactively addressing next time. Empty list if none were raised."],
  "decisions": ["concrete decisions or agreements reached during this meeting, each as a SELF-CONTAINED sentence (e.g. 'Agreed to move forward with the annual plan', 'Decided to use their existing vendor for onboarding'). Distinct from 'follow_ups' below - a decision is a SETTLED OUTCOME, not something still to be done. Empty list if no clear decisions were made."],
  "follow_ups": [
    {{
      "description": "string - the action item/to-do, written as a SELF-CONTAINED, SPECIFIC sentence that makes sense read entirely on its own, with no other context. ALWAYS name the actual subject/topic and who it's for/from - never leave it as a bare, ambiguous phrase. BAD (too vague): 'send revised timeline', 'Rohan to get back', 'follow up on this'. GOOD (specific): 'Send Vikas a revised delivery timeline for the project', 'Rohan to get back to us after discussing our pricing with his team'. If the note doesn't give enough detail to be this specific, include whatever specifics ARE available (topic, project, document type) rather than a generic placeholder.",
      "due_date": "string - when this follow-up is due, per the date-phrase rules above (a normalized relative phrase like 'next Monday'/'in 3 days', or an explicit YYYY-MM-DD), else null if no deadline was mentioned",
      "owner": "string - who owns this action item: 'me' if the user (the note-taker) needs to do it (e.g. 'I need to send...', 'Send Vikas a...'), 'them' if the other person owes it (e.g. 'Rohan to get back to us...', 'He's going to send over...'). Default to 'me' if genuinely unclear from phrasing."
    }}
  ]
}}

Notes:
- "sentiments" can have MULTIPLE entries when the person expressed different reactions to different things (e.g. skeptical about pricing, but impressed by the demo). Don't collapse these into one overall value. Use an empty list if no clear sentiment is expressed.
- Keep "description" and "appearance_this_meeting" distinct: description is who they generally ARE (stable traits that would still be true next time you meet them), appearance_this_meeting is what they looked like/wore in THIS specific note only (e.g. clothing on a given day is not a stable trait).
- Every "follow_ups" description, "other_people" entry, "concerns" entry, and "decisions" entry should be understandable in complete isolation, without needing to cross-reference the summary or raw note - imagine someone reading only that one field months later with no other context.
- Be faithful to the note - do not invent details that aren't stated or strongly implied.
- If information for a field isn't present, use an empty string, empty list, or null as appropriate.
"""


def extract_info(raw_text: str, reference_date: date = None) -> dict:
    """
    Calls the LLM to extract structured info from a raw note.
    `reference_date` anchors relative date resolution (defaults to today).
    Returns a dict matching the schema in _build_system_prompt.
    Raises ValueError if the model doesn't return valid JSON.
    """
    client = get_client()

    if reference_date is None:
        reference_date = date.today()

    system_prompt = _build_system_prompt(
        reference_date=reference_date.isoformat(),
        reference_weekday=reference_date.strftime("%A"),
    )

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": raw_text},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content

    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Model did not return valid JSON. Raw output:\n{content}") from e


if __name__ == "__main__":
    sample_note = (
        "Had a demo call with Rohan from Acme Logistics today. He's a Procurement Manager "
        "there. He seemed pretty skeptical about our pricing, said it's higher than their "
        "current vendor, but he seemed genuinely impressed with the product demo itself. "
        "He wears glasses, very analytical guy, comes across as pretty sincere and thorough. "
        "He was wearing a blue shirt and a blazer today. Said he'd get back to us after "
        "discussing with his team next week. Need to follow up with a pricing comparison "
        "doc by Friday."
    )
    result = extract_info(sample_note)
    print(json.dumps(result, indent=2))