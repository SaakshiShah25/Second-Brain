"""
extraction.py — Turns a raw narrated/typed note into structured JSON
using Groq's free-tier LLM API (fast + free Llama models).

Get a free API key at: https://console.groq.com/keys
Then set it as an environment variable:
    export GROQ_API_KEY="your_key_here"
"""

import json
from datetime import date

import text_utils
from llm_client import get_client, MODEL_NAME


def _build_system_prompt(reference_date: str, reference_weekday: str, initiative_names: list = None) -> str:
    # The reference date is injected dynamically so the model has an anchor
    # to resolve relative expressions ("today", "yesterday", "by Friday")
    # into absolute ISO dates. Without this the model has no idea what
    # "today" means and correctly returns null for everything relative.
    initiatives_block = (
        "\n".join(f'- "{n}"' for n in initiative_names) if initiative_names else "(none configured yet)"
    )
    return f"""You are an information-extraction engine for a personal memory app.
The user logs three kinds of notes - read the note carefully and pick the right one, since this
is the single most important decision you make:

1. An INTERACTION, or a FACT ABOUT A SPECIFIC PERSON - either (a) a conversation, meeting, or
   exchange that actually took place WITH one or more people (a call, a chat, a meeting, running
   into someone), OR (b) the note's actual content IS information about a specific named person -
   their role, their company, something you learned or now know about who they are - even with no
   conversation described at all (e.g. "Shouvik is the head of IT support at IBM" - nothing
   happened, but the note exists to record a fact about Shouvik specifically). The test for (b):
   is the note fundamentally ABOUT that person - telling you something new about who they are -
   rather than about something the user themselves needs to do?
2. A PERSONAL TASK/REMINDER/IDEA - something the user needs to do, wants to remember, or is
   reflecting on. This can be entirely about the user themselves ("need to fix my sleep
   schedule"), OR it can name another person as the TARGET/RECIPIENT of that action, without the
   note telling you anything ABOUT that person ("I need to send David Okafor my new email id
   tonight", "remind me to call Priya tomorrow", "idea: get Rohan a birthday gift"). The
   distinguishing test against kind 1(b): does the note describe a fact/trait/role belonging to
   the named person (kind 1), or is the person just who the user's own to-do is directed at, with
   nothing learned about them (kind 2)? Writing someone's name into a to-do does not, by itself,
   make it about them.
3. A standalone reflection/idea with genuinely no person involved at all.

Today's date is {reference_date} ({reference_weekday}).

"primary_person" is for kind 1 above (both the conversation case AND the fact-about-someone
case) - set it to JSON null (not an object, not the string "Unknown") for kind 2 and kind 3. Use
"Unknown" for the name only when a person was clearly interacted with (or a fact is clearly about
someone specific) but they weren't named (e.g. "talked to someone at the gym about my diet").

CRITICAL: any OTHER person named ANYWHERE in the note - including inside a follow-up/task
description, even when primary_person is null - MUST still appear in "other_people" below. This
is independent of whether the note describes an interaction: "other_people" captures every named
person the note mentions BESIDES primary_person, full stop. Concrete example - "I need to send
David Okafor my new email id tonight" is kind 2 (a personal task, no interaction happened):
"primary_person": null, but "other_people" must still include {{"name": "David Okafor", "relation":
"", "present": false}} so the task can be correctly linked to him. Do not drop a named person just
because primary_person is null.

NEVER list primary_person's own name again in "other_people" - it exists only for people OTHER
THAN primary_person. A note is often ABOUT its primary person by name throughout (e.g. "Met Isha
today, she's a UX designer..." names Isha once and then just says "she"/"her") - that repetition
does not make Isha an "other" person in her own note. Before finalizing "other_people", check
each entry isn't just primary_person's own name restated.

The user organizes notes into a fixed set of "initiatives" (life areas/projects) they manage
themselves. Classify this note into EXACTLY ONE of the initiatives below if it clearly and
confidently fits - otherwise use null. Never invent an initiative name that isn't in this list;
pick null rather than guess when it's ambiguous.

Initiatives:
{initiatives_block}

IMPORTANT - be careful with a broad, catch-all initiative like "Personal": it should only absorb
genuinely one-off, miscellaneous notes with no specific identifiable theme (buying groceries, a
random errand, a passing thought). Do NOT file something into a generic catch-all just because it
technically fits - if the note is actually about a specific, nameable pursuit (studying for an
exam, training for an event, a new hobby, a new job/role) and NONE of the initiatives above are
specific to that pursuit, that's exactly the case "suggested_initiative" below exists for, even
though the generic one would "work". Only skip the suggestion when the note truly has no
identifiable theme of its own.

If "initiative" above is null (the note doesn't fit any existing SPECIFIC initiative - as
described above, don't count a generic catch-all as a fit here either when a more specific
suggestion is warranted), consider whether this note represents a distinct, nameable theme or
project worth tracking as its OWN new initiative going forward - not a one-off errand or
something too vague to name (e.g. "buy milk", "felt tired today" should NOT get a suggestion). If
it clearly does (e.g. "started training for the Mumbai marathon" when no fitness/running
initiative exists, or "had my first day at the new consulting gig" when no such initiative
exists), set "suggested_initiative" to a short, specific 2-4 word name for it, and leave
"initiative" null. Otherwise, leave "suggested_initiative" null. Never suggest a name that
duplicates or is a close variant of an existing initiative above - if something like it already
exists, that's what "initiative" above should have matched instead. "suggested_initiative" must
always be null whenever "initiative" is non-null - the two are mutually exclusive.

IMPORTANT - for date/time references anchored to a WEEKDAY, a MONTH, or to
"today"/"tomorrow"/"yesterday" (e.g. "next Monday", "last Thursday", "by Friday",
"this Wednesday", "starting next month", "sometime last month"), do NOT calculate
the resulting calendar date yourself - this arithmetic is handled in code instead,
since it's error-prone to compute by hand (this includes MONTHS specifically - do
not compute "next month" into a date yourself, even though it looks simple; output
the phrase, not a date, exactly like the weekday case). Just output the phrase
normalized to one of: "today", "tomorrow", "yesterday", "next <weekday>",
"last <weekday>", "this <weekday>", a bare "<weekday>" with no qualifier (e.g. plain
"Friday", meaning the upcoming one), or "next month"/"last month"/"this month" -
using the weekday name/qualifier exactly as the note implies (e.g. "he'll get back
to us by next Monday" -> "next Monday"; "met him last Thursday" -> "last Thursday";
"starting next month" -> "next month").

For anything else - an explicit date the note states outright (e.g. "August 20th"),
or a loose/vague timeframe with no clean normalized form above (e.g. "in a couple
weeks", "sometime this quarter") - resolve it yourself into an absolute YYYY-MM-DD
using today's date above as your anchor. If no date/time reference is present at
all, leave the relevant field null - do not guess.

CRITICAL: every date field must be either a COMPLETE date (YYYY-MM-DD), one of the
normalized relative phrases described above, or null - NEVER a partial date like a
year-month only (e.g. "2026-09"). If the note only vaguely mentions a month or a
loose timeframe without a specific day and it doesn't fit a normalized phrase, pick
a single reasonable specific day within that period (e.g. the 1st of that month)
rather than leaving the date partial. Only use null when there is truly no time
reference at all.

Return ONLY valid JSON (no markdown fences, no preamble) matching this exact schema:

{{
  "primary_person": null if this note has no person involved at all (see instructions above) - otherwise an object: {{
    "name": "string - the main person's name as mentioned, or 'Unknown' if a person was involved but unnamed",
    "aliases": ["any nicknames/short forms used"],
    "description": "string - GENERAL, stable, PROFESSIONALLY-OBSERVABLE traits only: physical appearance (e.g. build, hair, glasses) and personality/demeanor (e.g. funny, sincere, analytical, reserved) that would still be true the next time you meet them. Do NOT include their job title or company here - those go in separate fields below. Do NOT include personal-life details (family, hobbies, interests, life events) - those go in 'personal_notes' below instead. Do NOT include a reaction or emotion about a specific thing discussed in THIS meeting (e.g. 'excited about the pricing change', 'skeptical about the timeline') - that is not a stable trait, it belongs in the 'sentiments' field below instead, tied to its specific topic. Empty string if nothing is mentioned. Do not invent traits that aren't stated or clearly implied.",
    "role": "string - their job title/role if mentioned (e.g. 'Procurement Manager'), else empty string",
    "company": "string - their company/organization if mentioned, else empty string",
    "personal_notes": "string - PERSONAL, non-professional details mentioned about them: family, hobbies/interests, alma mater, life events, upcoming personal plans (e.g. 'has two kids', 'into cycling on weekends', 'went to Stanford'). Kept separate from 'description' above, which is professional/stable demeanor and appearance only. Empty string if nothing personal was mentioned."
  }},
  "initiative": "string - the EXACT name of one initiative from the list above that this note best fits, or null if none confidently applies. Pick null rather than guess when uncertain - never invent a name not in the list.",
  "suggested_initiative": "string - ONLY when 'initiative' above is null AND this note represents a substantial theme/project worth tracking as a new initiative (see instructions above) - a short 2-4 word proposed name. Null otherwise, and ALWAYS null when 'initiative' is non-null.",
  "other_people": [
    {{
      "name": "string - the other person's name as mentioned, or 'Unknown' if they're referred to only by role/title/relation and never actually named (e.g. 'the CTO', 'his manager') - put the role/title in 'relation' below instead, NEVER use a role/title as the name itself",
      "relation": "string - how this person relates to the primary person and/or to the user, stated or clearly implied in the note (e.g. 'Priya's sister', 'Rohan's colleague, might join the next call'). Empty string if the note gives no indication of the relationship - do not guess.",
      "present": "boolean - true ONLY if this person actually took part in THIS specific meeting/conversation (e.g. joined the call, was physically there, spoke). false if they were merely mentioned/referenced by the primary person without being present themselves (e.g. 'his colleague Priya, who handles onboarding' - Priya wasn't on the call). Default to false when it's unclear - only mark true when the note clearly indicates they participated."
    }}
  ],
  "date_mentioned": "string - when the CONVERSATION/EVENT THIS NOTE DESCRIBES actually happened (past or today) - per the date-phrase rules above. Do NOT put a future date here just because one is mentioned - a personal task/reminder being logged today ('set up a demo with Mansi tomorrow', 'need to call the bank next week') is being written TODAY about something not done yet; 'tomorrow'/'next week' there belongs on that follow-up's own due_date below, not here. Leave this null (it defaults to today) whenever the note is simply a forward-looking task/reminder with no past-or-present interaction actually described - only set it when the note recounts something that has already happened or is happening now.",
  "location": "string - location mentioned, else null",
  "appearance_this_meeting": "string - what the person was WEARING or looked like SPECIFICALLY at this particular meeting/interaction (e.g. 'wore a blue shirt and blazer'), as opposed to their general stable appearance. Empty string if nothing meeting-specific was mentioned.",
  "meeting_type": "string - the TYPE of this meeting/interaction. Must be one of: 'discovery', 'demo', 'negotiation', 'check-in', 'networking', 'contract', 'support', 'internal', 'other'. Always pick the closest fit from context (e.g. a first exploratory call is 'discovery', a casual run-in at an event is 'networking') - use 'other' only if genuinely nothing fits, never leave this blank.",
  "summary": "string - a concise 1-3 sentence summary of what happened/was discussed. NEVER refer to the note-taker (the person logging this note) as 'the user' or 'User' - that reads as a placeholder leaking through, not a real sentence. For a note involving another person, phrase it around what THEY said/did (e.g. 'Discussed pricing concerns with Arjun...'). For a personal note/reminder with no one else involved, phrase it in first person, matching how the note-taker would actually say it (e.g. 'Need to send David Okafor the new email address.', not 'User needs to send...').",
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
- "primary_person" is null for a standalone personal note (idea/to-do/reflection with no one else involved) - most other fields (other_people, sentiments, appearance_this_meeting, etc.) will naturally be empty/null in that case too, which is expected, not an error.
- "initiative" only ever names one of the initiatives listed above, verbatim, or null - never a name outside that list.
- "suggested_initiative" is the one exception to "never invent a name" above - it's specifically FOR proposing a new one, but only when "initiative" is null and the note is substantial enough to deserve its own category (see instructions above), not for every uncategorized note.
- Always output person names and company names in proper capitalization (e.g. "David Okafor", "IBM", "Acme Corp"), regardless of how they appear in the source text - voice transcripts in particular sometimes come through in lowercase or inconsistent casing, and that's a transcription artifact, not how the name should be recorded or displayed.
"""


def extract_info(raw_text: str, reference_date: date = None, initiative_names: list = None) -> dict:
    """
    Calls the LLM to extract structured info from a raw note.
    `reference_date` anchors relative date resolution (defaults to today).
    `initiative_names` is the user's current list of initiatives (see
    db.get_initiatives) - passed through so the model can classify this
    note into one of them, or null if none confidently fit.
    Returns a dict matching the schema in _build_system_prompt.
    Raises ValueError if the model doesn't return valid JSON.
    """
    client = get_client()

    if reference_date is None:
        reference_date = date.today()

    system_prompt = _build_system_prompt(
        reference_date=reference_date.isoformat(),
        reference_weekday=reference_date.strftime("%A"),
        initiative_names=initiative_names,
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

    content = text_utils.normalize_text(response.choices[0].message.content)

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