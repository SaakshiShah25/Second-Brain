"""
capture.py — The main entry point for capturing a note.

Flow:
    1. Take raw text (typed or already-transcribed voice note)
    2. Run it through extraction.py to get structured JSON
    3. Resolve the person INTERACTIVELY: if the extracted name has any
       plausible match against existing People (including alias/nickname
       matches), ask the user to confirm before merging. Nicknames are
       NOT unique (e.g. "Sid" could be short for "Sidharth" met months ago,
       or a brand-new person also named Sid) so auto-merging on a fuzzy or
       even exact alias match is unsafe. Only when there are zero
       plausible candidates does the app create a new person without asking.
    4. Compute a semantic embedding of the raw text (for retrieval later,
       stored in Supabase's pgvector column via db.py)
    5. Store everything: Person (created/updated), Interaction, Tasks

Run directly for a quick CLI test:
    python capture.py

Note: aliases/tags/etc. come back from db.py as native Python lists/dicts
now (Supabase's jsonb columns), not JSON strings - so unlike the old
SQLite version there's no json.loads needed when reading them back here.
"""

import json
from datetime import date

import db
import extraction
from embeddings import compute_embedding
from person_match import score_candidates, find_confident_match
from date_utils import to_valid_date

# ---------- Person resolution (interactive — requires confirmation) ----------


def _prompt_user_to_confirm(name: str, description: str, role: str, company: str, candidates: list):
    """
    CLI confirmation prompt. Returns the chosen existing person dict, or
    None if the user says this is a new person.

    NOTE: this is the piece to swap out for a real UI later (e.g. a
    confirmation modal in an app) — everything else in capture.py stays
    the same, it just needs something that implements this same contract:
    given a name + candidates, return the matching person or None.
    """
    context_bits = [b for b in [description, role, company] if b]
    context_str = f" ({', '.join(context_bits)})" if context_bits else ""
    print(f"\nThe note mentions '{name}'{context_str}.")
    print("Is this the same person as one of these existing entries?")
    for i, (person, score) in enumerate(candidates, start=1):
        aliases = person.get("aliases") or []
        alias_str = f" (aka {', '.join(aliases)})" if aliases else ""
        role_company = ", ".join(b for b in [person.get("role"), person.get("company")] if b)
        detail = person.get("description") or "no description yet"
        if role_company:
            detail = f"{detail} — {role_company}"
        print(f"  {i}. {person['name']}{alias_str} — {detail} [match: {score:.0%}]")
    print(f"  0. None of these — '{name}' is a new person")

    while True:
        choice = input("Enter number: ").strip()
        if choice.isdigit():
            choice_i = int(choice)
            if choice_i == 0:
                return None
            if 1 <= choice_i <= len(candidates):
                return candidates[choice_i - 1][0]
        print("Please enter a valid number from the list above.")


def resolve_person(name: str, description: str = "", role: str = "", company: str = "",
                    first_met_date: str = None):
    """
    Resolve a mentioned name to a Person record, asking the user to confirm
    whenever there's ambiguity.
      - No candidates at all -> create new person automatically (nothing
        to confirm, there's no ambiguity to resolve).
      - One or more candidates -> ask the user which one (or "new person").
    `first_met_date` should be the (already-resolved, validated) date this
    NOTE says the interaction happened - not necessarily today - since
    that's the most accurate "first met" date we have for a brand-new
    person. Falls back to today if not given. On a MERGE into an existing
    person, first_met_date is never touched (that person's actual first
    meeting was necessarily earlier, in an earlier interaction).
    Returns (person_id, resolved_name, was_created).
    """
    if first_met_date is None:
        first_met_date = date.today().isoformat()

    people = db.get_all_people()
    candidates = score_candidates(name, people)

    if not candidates:
        person_id = db.create_person(
            name=name, description=description, role=role, company=company,
            first_met_date=first_met_date,
        )
        return person_id, name, True

    chosen = _prompt_user_to_confirm(name, description, role, company, candidates)

    if chosen is None:
        person_id = db.create_person(
            name=name, description=description, role=role, company=company,
            first_met_date=first_met_date,
        )
        return person_id, name, True

    person_id = chosen["id"]
    if name != chosen["name"]:
        db.add_alias(person_id, name)
    if description:
        db.update_person_description(person_id, description)
    if role or company:
        db.update_person_role_company(person_id, role=role, company=company)
    return person_id, chosen["name"], False


# ---------- Secondary-person resolution (never asks - see person_match.find_confident_match) ----------

def resolve_and_link_other_people(user_id: str, interaction_id: int, other_people: list, interaction_date: str):
    """
    For each person mentioned besides the primary one (extraction.py's
    `other_people`, shaped [{"name":..., "relation":...}]), resolve or
    create a Person and link them to this interaction via
    db.link_interaction_person() - so they're independently queryable
    later (e.g. "what do I know about Rhea?") even if they never get their
    own primary note.

    Unlike resolve_person() above, this NEVER interactively asks: it
    auto-links on a confident (>=0.9) name/alias match
    (person_match.find_confident_match), and auto-creates a new person
    otherwise. These are secondary, in-passing mentions, not the focus of
    the note - a wrong auto-created duplicate is a safe failure now that
    the People page has a merge feature, so it's not worth interrupting
    capture with a prompt for every ambiguous secondary name.

    Also handles the legacy flat-string `other_people` format (old rows
    predate the {"name","relation"} shape - see README's "Schema note:
    other_people format changed"). `person`/`interaction` matching and
    creation is scoped to `user_id` throughout, same as every other db.py
    call - a secondary mention never resolves against another user's people.
    """
    if not other_people:
        return

    people = db.get_all_people(user_id)
    for entry in other_people:
        if isinstance(entry, dict):
            name = entry.get("name")
            relation = entry.get("relation", "") or ""
            present = entry.get("present", False)
        else:
            name, relation, present = str(entry), "", False
        if not name:
            continue

        match = find_confident_match(name, people)
        if match:
            person_id = match["id"]
        else:
            person_id = db.create_person(
                user_id, name=name, first_met_date=interaction_date if present else None,
            )
            # so a second mention of this same new name later in the same
            # note matches it too, instead of creating another duplicate
            people.append(db.get_person(user_id, person_id))

        db.link_interaction_person(user_id, interaction_id, person_id, relation)


# ---------- Main capture flow ----------

def capture_note(raw_text: str, interaction_date: str = None):
    if interaction_date is None:
        interaction_date = date.today().isoformat()

    print("Extracting structured info...")
    extracted = extraction.extract_info(raw_text)

    primary = extracted.get("primary_person", {}) or {}
    name = primary.get("name") or "Unknown"
    description = primary.get("description") or ""
    role = primary.get("role") or ""
    company = primary.get("company") or ""

    # Resolve/validate the interaction's actual date BEFORE resolving the
    # person, so a brand-new person's first_met_date reflects what the note
    # says (e.g. "met him last week") rather than always being today - the
    # date capture.py happens to be run on and the date the meeting
    # occurred aren't necessarily the same day.
    raw_date = extracted.get("date_mentioned")
    interaction_date_resolved = to_valid_date(raw_date) or interaction_date
    if raw_date and not to_valid_date(raw_date):
        print(f"[warn] Extracted date '{raw_date}' wasn't a complete date - using {interaction_date_resolved} instead.")

    person_id, resolved_name, was_created = resolve_person(
        name, description, role, company, first_met_date=interaction_date_resolved,
    )
    status = "created new" if was_created else "matched existing"
    print(f"Person: '{name}' -> {status} person '{resolved_name}' (id={person_id})")

    print("Computing embedding...")
    embedding = compute_embedding(raw_text)

    sentiments = extracted.get("sentiments", []) or []
    extracted_facts = {
        "other_people": extracted.get("other_people", []),
        "opinions_expressed": extracted.get("opinions_expressed", []),
    }

    interaction_id = db.create_interaction(
        person_id=person_id,
        raw_text=raw_text,
        date=interaction_date_resolved,
        location=extracted.get("location"),
        appearance=extracted.get("appearance_this_meeting", "") or "",
        summary=extracted.get("summary", ""),
        sentiment=sentiments,                 # native list -> jsonb column
        topics=extracted.get("topics", []),
        extracted_facts=extracted_facts,
        embedding=embedding,                  # native list[float] -> pgvector column
    )
    print(f"Stored interaction id={interaction_id}")

    resolve_and_link_other_people(interaction_id, extracted.get("other_people", []) or [], interaction_date_resolved)

    follow_ups = extracted.get("follow_ups", []) or []
    for item in follow_ups:
        # Support both the new {description, due_date} shape and a plain
        # string, in case the model ever returns the older format.
        if isinstance(item, dict):
            task_desc = item.get("description", "")
            raw_due_date = item.get("due_date")
        else:
            task_desc, raw_due_date = str(item), None
        if not task_desc:
            continue
        due_date = to_valid_date(raw_due_date)  # same validation - invalid -> no due date, task still saved
        if raw_due_date and not due_date:
            print(f"[warn] Follow-up due date '{raw_due_date}' wasn't a complete date - saving task without one.")
        task_id = db.create_task(interaction_id, task_desc, due_date=due_date)
        due_str = f" (due {due_date})" if due_date else ""
        print(f"  + Task created (id={task_id}): {task_desc}{due_str}")

    return {
        "person_id": person_id,
        "interaction_id": interaction_id,
        "extracted": extracted,
    }


if __name__ == "__main__":
    print("=== Second Brain: Capture a note ===")
    print("(Make sure you've run schema.sql in Supabase and set SUPABASE_URL / "
          "SUPABASE_KEY / GROQ_API_KEY - see README.md)\n")
    print("Type or paste your note (a full conversation/observation). "
          "End input with an empty line:\n")

    lines = []
    while True:
        line = input()
        if line.strip() == "":
            break
        lines.append(line)
    raw_note = "\n".join(lines)

    if not raw_note.strip():
        print("No input given, exiting.")
    else:
        result = capture_note(raw_note)
        print("\n--- Extracted data ---")
        print(json.dumps(result["extracted"], indent=2))