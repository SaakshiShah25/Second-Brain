"""
retrieval.py — Answers a user's natural-language query about people/interactions.

Two paths, chosen automatically based on what the query contains:

  A. NAMED query ("what did I talk to Rohan about", "summarize my last
     meeting with Sid", "when did I first meet Priya") — resolves the
     mentioned name to an existing Person (asking you to disambiguate if
     more than one existing person plausibly matches - never guesses),
     then pulls their interaction(s) directly from Postgres by person_id:
     either all of them, just the latest, just the first, or the one
     closest to a specific date — whichever the query implies.

  B. VAGUE query ("that guy who was skeptical about pricing", "who did I
     talk to about the Q3 roadmap") — no resolvable person name, so it
     falls back to semantic search: embeds the query and calls
     db.search_interactions_by_embedding(), which runs a real pgvector
     cosine-similarity search (via the match_interactions() SQL function
     in schema.sql) rather than a Python-side scan over every row.

Either way, whatever interaction(s) get selected are handed to an LLM
(synthesize_answer) which writes the actual natural-language answer -
grounded only in what was retrieved, not invented.

Run directly for a CLI query loop:
    python retrieval.py
"""

import json
from datetime import date, datetime

import db
from llm_client import get_client, MODEL_NAME
from embeddings import compute_embedding
from person_match import score_candidates


# ---------- Step 1: understand the query ----------

def _build_query_parse_prompt(reference_date: str) -> str:
    return f"""You are a query-understanding engine for a personal memory app.
Today's date is {reference_date}. Given the user's question, extract what they're asking for.

The user's message may be preceded by a short "Recent conversation" transcript. If the current
question uses a pronoun (he/him/his/she/her/they/them) or a vague back-reference ("that day",
"that meeting", "the same person", "him too") instead of naming someone/something explicitly,
use the recent conversation to resolve who/what is being referred to - the assistant's own prior
answers will usually state the relevant person's name and any relevant dates directly. Only resolve
a reference this way if the conversation makes it reasonably clear; if it's genuinely ambiguous
(e.g. more than one person was just discussed and it's unclear which "he" means), leave the
relevant field null rather than guessing. If the current question already names a person or date
explicitly, that always takes priority over anything inferred from the conversation.

Return ONLY valid JSON (no markdown fences, no preamble):
{{
  "person_name": "string - a specific person's name/nickname, either stated in the current question OR resolved from a pronoun/back-reference using the recent conversation as described above, else null",
  "scope": "one of: 'latest' (most recent meeting/interaction), 'first' (earliest/first meeting), 'specific_date' (a particular date or time period is referenced, INCLUDING when it's referenced indirectly via 'that day'/'that meeting' and resolved from the recent conversation), 'all' (summarize the whole relationship / no specific meeting singled out)",
  "specific_date": "string - if scope is 'specific_date', the ABSOLUTE date (YYYY-MM-DD) resolved from any relative reference (including one resolved from the recent conversation, e.g. a date the assistant mentioned in its last answer) using today's date above, else null",
  "semantic_query": "string - a clean, content-focused restatement of what the user is trying to recall, stripped of phrasing like 'what did we talk about' (e.g. 'pricing concerns and API rate limits discussion'). Always fill this in, even when person_name is present - it's the fallback used for semantic search, and can help narrow down which meeting is relevant."
}}

Examples (illustrative only):
- "What did I talk to Rohan about last time?" -> person_name: "Rohan", scope: "latest"
- "When did I first meet Priya?" -> person_name: "Priya", scope: "first"
- "Summarize everything I've discussed with Sid" -> person_name: "Sid", scope: "all"
- "What did that guy who seemed skeptical about pricing say?" -> person_name: null, scope: "all", semantic_query: "skeptical about pricing"
- "What happened in my meeting with Rohan in May?" -> person_name: "Rohan", scope: "specific_date", specific_date resolved to a date in May of this/last year as implied
- Recent conversation mentions "your last meeting with Rohan on 2026-08-10", then the user asks "What did he wear that day?" -> person_name: "Rohan", scope: "specific_date", specific_date: "2026-08-10"
"""


def format_recent_context(history: list, max_turns: int = 3) -> str:
    """
    Formats the last `max_turns` (user, assistant) exchanges from a chat
    history into plain text for the query parser to resolve pronouns and
    vague back-references against ("him", "that day", "that meeting").

    No separate state-tracking is needed for this: the assistant's own
    prior answers already state the relevant person's name and any dates
    directly (synthesize_answer is instructed to reference dates), so
    recent raw text is usually enough context to resolve a reference.

    `history` is a list of {"role": "user"/"assistant", "content": str}
    dicts - the same shape used by app.py's st.session_state.chat_history.
    """
    if not history:
        return ""
    recent = history[-(max_turns * 2):]  # each turn ~= 1 user + 1 assistant message
    lines = [f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}" for m in recent]
    return "\n".join(lines)


def parse_query(user_query: str, reference_date: date = None, conversation_context: str = "") -> dict:
    if reference_date is None:
        reference_date = date.today()

    if conversation_context:
        user_message = f"Recent conversation:\n{conversation_context}\n\nCurrent question: {user_query}"
    else:
        user_message = user_query

    client = get_client()
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": _build_query_parse_prompt(reference_date.isoformat())},
            {"role": "user", "content": user_message},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Query parser did not return valid JSON. Raw output:\n{content}") from e


# ---------- Step 2a: resolve a named person (read-only — never creates one) ----------

def _prompt_disambiguate(name: str, candidates: list):
    """
    CLI disambiguation prompt for when a query's person name matches more
    than one existing Person. Returns the chosen person dict, or None if
    the user says none of them match (e.g. it's someone not logged yet).
    """
    print(f"\n'{name}' could refer to more than one person you've logged:")
    for i, (person, score) in enumerate(candidates, start=1):
        role_company = ", ".join(b for b in [person.get("role"), person.get("company")] if b)
        detail = person.get("description") or "no description yet"
        if role_company:
            detail = f"{detail} — {role_company}"
        print(f"  {i}. {person['name']} — {detail} [match: {score:.0%}]")
    print("  0. None of these")

    while True:
        choice = input("Enter number: ").strip()
        if choice.isdigit():
            choice_i = int(choice)
            if choice_i == 0:
                return None
            if 1 <= choice_i <= len(candidates):
                return candidates[choice_i - 1][0]
        print("Please enter a valid number from the list above.")


def resolve_person_for_query(name: str):
    """
    Look up an EXISTING person by name for answering a query. Never creates
    a new person - retrieval is read-only. If exactly one plausible match
    exists, use it directly (no ambiguity to resolve). If more than one
    plausible match exists, ask which one is meant rather than guessing.
    Returns the person dict, or None if nothing plausible was found (or the
    user rejected all candidates).
    """
    people = db.get_all_people()
    candidates = score_candidates(name, people)

    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0][0]
    return _prompt_disambiguate(name, candidates)


# ---------- Step 2b: include interactions where this person was only a secondary mention ----------

def _normalize_secondary(rows: list) -> list:
    """
    Flattens db.get_secondary_interactions_for_person()'s nested join shape
    (interaction_person row -> interaction -> primary person) into the same
    flat interaction-dict shape db.get_interactions_for_person() returns,
    tagged with a `secondary_mention` marker so _format_interaction_block
    can phrase it as "mentioned in", not a direct interaction with them.
    """
    flattened = []
    for row in rows:
        interaction = dict(row.get("interaction") or {})
        primary_person = interaction.pop("person", None) or {}
        interaction["secondary_mention"] = {
            "relation": row.get("relation") or "",
            "primary_person_name": primary_person.get("name") or "someone",
        }
        flattened.append(interaction)
    return flattened


def get_all_interactions_for_person(user_id: str, person_id: int) -> list:
    """
    This person's own (primary) interactions PLUS interactions where they
    were only mentioned as a secondary person (e.g. "Rhea" showing up as
    "Priya's sister" in a note about Priya) - so asking about someone who
    was only ever mentioned in passing still finds something, not just
    people who got their own dedicated note.
    """
    primary = db.get_interactions_for_person(user_id, person_id)
    secondary = _normalize_secondary(db.get_secondary_interactions_for_person(user_id, person_id))
    return primary + secondary


# ---------- Step 2c: pick which interaction(s) satisfy the query's scope ----------

def _parse_date(value):
    try:
        return datetime.fromisoformat(value).date() if value else None
    except (ValueError, TypeError):
        return None


def select_by_scope(interactions: list, scope: str, specific_date: str = None):
    """
    Given all of a person's interactions, narrow down to the ones the
    query's scope implies:
      - 'latest'        -> just the most recent one
      - 'first'         -> just the earliest one
      - 'specific_date' -> exact date matches if any, else the single
                            closest-dated interaction
      - 'all' (default) -> everything (used to summarize the relationship)
    """
    sorted_interactions = sorted(
        interactions,
        key=lambda i: (i.get("date") or "", i.get("created_at") or ""),
    )
    if not sorted_interactions:
        return []

    if scope == "latest":
        return [sorted_interactions[-1]]
    if scope == "first":
        return [sorted_interactions[0]]
    if scope == "specific_date" and specific_date:
        exact = [i for i in sorted_interactions if i.get("date") == specific_date]
        if exact:
            return exact
        target = _parse_date(specific_date)
        dated = [(i, _parse_date(i.get("date"))) for i in sorted_interactions]
        dated = [(i, d) for i, d in dated if d is not None]
        if not dated or target is None:
            return sorted_interactions  # nothing dated to compare -> safest fallback
        closest = min(dated, key=lambda pair: abs((pair[1] - target).days))
        return [closest[0]]

    return sorted_interactions  # scope == "all" or unrecognized -> safest default


# ---------- Step 2d: attach related follow-up tasks to each interaction ----------

def attach_tasks(user_id: str, interactions: list) -> list:
    """
    Fetches Task rows tied to the given interactions and attaches them
    under a "tasks" key on each interaction dict, so synthesize_answer
    (and _format_interaction_block) can surface follow-ups too, not just
    the interaction's own summary/sentiment/topics.

    Returns NEW interaction dicts (doesn't mutate the input) with "tasks"
    populated: [] if that interaction has no follow-ups.
    """

    # Final output eg: (interaction + tasks associated with that interaction)
    # {
    #     "id": 101,
    #     "summary": "Refund requested",
    #     "tasks": [
    #         {"id": 1, "interaction_id": 101, "description": "Process refund"},
    #         {"id": 2, "interaction_id": 101, "description": "Send confirmation"}
    #     ]
    # }
    if not interactions:
        return interactions

    ids = [i["id"] for i in interactions]
    tasks = db.get_tasks_for_interactions(user_id, ids)

    tasks_by_interaction = {}
    for t in tasks:
        tasks_by_interaction.setdefault(t["interaction_id"], []).append(t)

    enriched = []
    for interaction in interactions:
        interaction_copy = dict(interaction)
        interaction_copy["tasks"] = tasks_by_interaction.get(interaction["id"], [])
        enriched.append(interaction_copy)
    return enriched


# ---------- Step 3: synthesize the final natural-language answer ----------

def _format_interaction_block(interaction: dict) -> str:
    lines = [f"Date: {interaction.get('date') or 'unknown'}"]
    secondary = interaction.get("secondary_mention")
    if secondary:
        rel = f", {secondary['relation']}" if secondary.get("relation") else ""
        lines.append(
            f"Note: this person was MENTIONED (not a direct interaction) in a note "
            f"primarily about {secondary['primary_person_name']}{rel}."
        )
    if interaction.get("meeting_type"):
        lines.append(f"Meeting type: {interaction['meeting_type']}")
    if interaction.get("location"):
        lines.append(f"Location: {interaction['location']}")
    if interaction.get("appearance"):
        lines.append(f"Appearance that day: {interaction['appearance']}")
    if interaction.get("summary"):
        lines.append(f"Summary: {interaction['summary']}")
    sentiments = interaction.get("sentiment") or []
    if sentiments:
        sentiment_str = "; ".join(f"{s.get('topic')}: {s.get('sentiment')}" for s in sentiments)
        lines.append(f"Sentiments: {sentiment_str}")
    topics = interaction.get("topics") or []
    if topics:
        lines.append(f"Topics: {', '.join(topics)}")
    facts = interaction.get("extracted_facts") or {}
    opinions = facts.get("opinions_expressed") or []
    if opinions:
        lines.append(f"Opinions expressed: {'; '.join(opinions)}")
    concerns = interaction.get("concerns") or []
    if concerns:
        lines.append(f"Concerns raised: {'; '.join(concerns)}")
    decisions = interaction.get("decisions") or []
    if decisions:
        lines.append(f"Decisions made: {'; '.join(decisions)}")
    tasks = interaction.get("tasks") or []
    if tasks:
        lines.append("Follow-ups from this interaction:")
        for t in tasks:
            status = t.get("status", "open")
            due = f", due {t['due_date']}" if t.get("due_date") else ", no due date"
            owner = t.get("owner") or "me"
            owner_str = "the user owes this" if owner == "me" else "this person owes the user"
            lines.append(f"  - {t['description']} [{status}{due}, {owner_str}]")
    if interaction.get("raw_text"):
        lines.append(f"Original note: {interaction['raw_text']}")
    return "\n".join(lines)


def _build_person_context(person: dict) -> str:
    """Shared by synthesize_answer() and generate_briefing() - a short
    "Person: X (traits; role, company)" header line. Includes
    personal_notes alongside description so briefings can actually draw
    on family/hobbies/interests, not just professional traits."""
    bits = [person.get("description") or ""]
    if person.get("personal_notes"):
        bits.append(person["personal_notes"])
    role_company = ", ".join(b for b in [person.get("role"), person.get("company")] if b)
    if role_company:
        bits.append(role_company)
    return f"Person: {person['name']} ({'; '.join(b for b in bits if b)})\n\n"


def synthesize_answer(user_query: str, interactions: list, person: dict = None) -> str:
    if not interactions:
        who = f" with {person['name']}" if person else ""
        return f"I don't have any recorded interactions{who} that match this."

    person_context = _build_person_context(person) if person else ""

    interactions_sorted = sorted(interactions, key=lambda i: i.get("date") or "")
    blocks = "\n\n".join(
        f"--- Interaction {i + 1} ---\n{_format_interaction_block(interaction)}"
        for i, interaction in enumerate(interactions_sorted)
    )

    system_prompt = """You are a personal memory assistant. Answer the user's question using ONLY the
interaction records provided below - do not invent or assume anything not stated in them.
Reference specific dates when relevant, especially if multiple interactions are involved.
Each interaction may list "Follow-ups from this interaction" (action items/to-dos with a
status and due date) - draw on these directly if the user asks about tasks, follow-ups,
to-dos, or what needs to happen next, and mention status/due dates when relevant.
If the records don't actually contain an answer to the question, say so plainly instead of guessing.
Write a natural, conversational answer (not a bulleted data dump) unless the user's question
specifically calls for a list."""

    user_content = f"{person_context}{blocks}\n\nUser's question: {user_query}"

    client = get_client()
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        temperature=0.4,
    )
    return response.choices[0].message.content


def generate_briefing(user_id: str, person_id: int) -> str:
    """
    Prepares a short "here's what to remember before reconnecting" brief
    for a person - used by the Digest and People pages' "Get briefing"
    button. Distinct from synthesize_answer(): not answering a specific
    question, but proactively summarizing who they are, what was last
    discussed, and what's still open. Grounded the same way - via the same
    get_all_interactions_for_person() (so someone who was only ever a
    secondary mention gets briefed honestly, not as a real conversation)
    and _format_interaction_block().
    """
    person = db.get_person(user_id, person_id)
    if not person:
        return "I don't have a record of this person."

    interactions = get_all_interactions_for_person(user_id, person_id)
    if not interactions:
        return f"No interactions recorded with {person['name']} yet."

    interactions = attach_tasks(user_id, interactions)
    interactions_sorted = sorted(interactions, key=lambda i: i.get("date") or "")
    blocks = "\n\n".join(
        f"--- Interaction {i + 1} ---\n{_format_interaction_block(interaction)}"
        for i, interaction in enumerate(interactions_sorted)
    )

    person_context = _build_person_context(person)

    system_prompt = """You are helping the user prepare to reconnect with someone they haven't
talked to in a while, or are about to meet again. Using ONLY the interaction records below,
write a short, natural briefing covering: who this person is, what was last discussed and how
it went (their sentiment/reactions), anything specific worth remembering about them (appearance,
personality, personal details they mentioned) so the reconnection feels genuine, and any open
follow-ups involving them specifically. If they were only ever mentioned by someone else (not a
direct interaction), say so plainly rather than implying you've spoken with them. Do not invent
or assume anything not stated in the records. Keep it concise - a few sentences, not a report."""

    client = get_client()
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"{person_context}{blocks}"},
        ],
        temperature=0.4,
    )
    return response.choices[0].message.content


# ---------- Main entry point ----------

def answer_query(user_query: str, conversation_context: str = "") -> str:
    parsed = parse_query(user_query, conversation_context=conversation_context)
    person = None

    if parsed.get("person_name"):
        person = resolve_person_for_query(parsed["person_name"])

    if person:
        # Path A: named person -> direct structured lookup by person_id,
        # plus any interactions where they were only a secondary mention.
        interactions = get_all_interactions_for_person(person["id"])
        if not interactions:
            return f"I don't have any interactions recorded for {person['name']} yet."
        selected = select_by_scope(interactions, parsed.get("scope", "all"), parsed.get("specific_date"))
    else:
        # Path B: no resolvable named person -> vague reference, fall back
        # to semantic search across everything via pgvector.
        semantic_query = parsed.get("semantic_query") or user_query
        query_embedding = compute_embedding(semantic_query)
        if query_embedding is None:
            return ("I couldn't resolve a specific person from your question, and semantic "
                    "search isn't available right now (embedding model not loaded).")
        matches = db.search_interactions_by_embedding(query_embedding, top_k=5)
        if not matches:
            return "I couldn't find anything matching that."
        selected = db.get_interactions_by_ids([m["id"] for m in matches])

    selected = attach_tasks(selected)
    return synthesize_answer(user_query, selected, person)


if __name__ == "__main__":
    print("=== Second Brain: Ask a question ===")
    print("(Make sure SUPABASE_URL / SUPABASE_KEY / GROQ_API_KEY are set - see README.md)\n")
    history = []  # tracks this session's turns so pronouns/back-references resolve correctly
    while True:
        query = input("Ask (or 'quit'): ").strip()
        if query.lower() in ("quit", "exit", ""):
            break
        context = format_recent_context(history)
        answer = answer_query(query, conversation_context=context)
        print(f"\n{answer}\n")
        history.append({"role": "user", "content": query})
        history.append({"role": "assistant", "content": answer})