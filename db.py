"""
db.py — Supabase (Postgres + pgvector) storage layer for the "Second Brain" prototype.

Replaces the earlier local-SQLite version. Structured data (Person, Interaction,
Task) lives in Postgres tables; embeddings live in a real pgvector `vector`
column with a cosine-similarity ANN index - not a JSON list stuffed into a
text column. Supabase's free tier includes Postgres + pgvector, so this is
one database doing both the structured-data job and the vector-DB job,
rather than needing a second hosted vector service.

Setup:
    1. Create a free project at https://supabase.com
    2. In the SQL Editor, run schema.sql (creates tables, the pgvector
       extension, the similarity-search function, and the ANN index)
    3. Set environment variables:
        export SUPABASE_URL="https://xxxx.supabase.co"
        export SUPABASE_KEY="your_service_role_key"      # see README for why service_role

Note: jsonb columns (aliases, tags, sentiment, topics, extracted_facts) are
sent/received as native Python lists/dicts here - the supabase-py client
handles JSON (de)serialization automatically, so there's no more manual
json.dumps/json.loads anywhere in this file (unlike the old SQLite version).

Multi-user note: every function below that touches person/interaction/task/
interaction_person takes an explicit `user_id` and either filters by it
(reads/updates/deletes - this is the ownership check: a mismatched id
simply matches 0 rows) or sets it (creates). db.py always uses the
service_role key (see get_client()), which bypasses Postgres RLS entirely -
so this filtering is what actually keeps one user's data from leaking into
another's, not the RLS policies in schema.sql (those are defense-in-depth
for a different access path, e.g. the anon key). Callers (api/routers/*.py)
get `user_id` from api/auth.py's get_current_user_id() dependency, which
verifies it against Supabase Auth - it is never client-supplied.
"""

import os
from datetime import datetime, timedelta, timezone

from supabase import create_client, Client

_client = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL / SUPABASE_KEY environment variables not set. "
                "Create a free project at https://supabase.com, run schema.sql "
                "in the SQL editor, then set these env vars. See README.md."
            )
        _client = create_client(url, key)
    return _client


# ---------- Person helpers ----------

def get_all_people(user_id: str):
    resp = get_client().table("person").select("*").eq("user_id", user_id).execute()
    return resp.data


def create_person(user_id: str, name, description="", role="", company="", phone="", email="",
                   aliases=None, tags=None, first_met_date=None, personal_notes=""):
    resp = get_client().table("person").insert({
        "user_id": user_id,
        "name": name,
        "aliases": aliases or [],
        "description": description,
        "role": role,
        "company": company,
        "phone": phone,
        "email": email,
        "tags": tags or [],
        "first_met_date": first_met_date,
        "personal_notes": personal_notes,
    }).execute()
    return resp.data[0]["id"]


def update_person_description(user_id: str, person_id, new_description):
    """Passive enrichment: append new observations rather than overwrite."""
    client = get_client()
    row = (
        client.table("person").select("description")
        .eq("id", person_id).eq("user_id", user_id).single().execute()
    )
    existing = (row.data or {}).get("description") or ""
    merged = (existing + "\n" + new_description).strip() if existing else new_description
    client.table("person").update({"description": merged}).eq("id", person_id).eq("user_id", user_id).execute()


def update_person_personal_notes(user_id: str, person_id, new_notes):
    """Passive enrichment for personal/non-professional details - same
    append-not-overwrite convention as update_person_description(), kept
    as a separate column so briefings can draw on personal details
    without them polluting the professional `description` field."""
    client = get_client()
    row = (
        client.table("person").select("personal_notes")
        .eq("id", person_id).eq("user_id", user_id).single().execute()
    )
    existing = (row.data or {}).get("personal_notes") or ""
    merged = (existing + "\n" + new_notes).strip() if existing else new_notes
    client.table("person").update({"personal_notes": merged}).eq("id", person_id).eq("user_id", user_id).execute()


def update_person_role_company(user_id: str, person_id, role=None, company=None):
    """
    Overwrite role/company with the latest mentioned value (people change jobs;
    unlike description, this shouldn't just keep accumulating text).
    Only touches fields where a non-empty new value was actually provided.
    """
    update_fields = {}
    if role:
        update_fields["role"] = role
    if company:
        update_fields["company"] = company
    if update_fields:
        get_client().table("person").update(update_fields).eq("id", person_id).eq("user_id", user_id).execute()


def add_alias(user_id: str, person_id, alias):
    client = get_client()
    row = client.table("person").select("aliases").eq("id", person_id).eq("user_id", user_id).single().execute()
    aliases = (row.data or {}).get("aliases") or []
    if alias not in aliases:
        aliases.append(alias)
        client.table("person").update({"aliases": aliases}).eq("id", person_id).eq("user_id", user_id).execute()


def get_people_with_last_interaction(user_id: str):
    """
    Every person plus their most recent PRIMARY interaction date (secondary
    "mentioned in" appearances - see interaction_person - don't count as
    "you talked to them"), as [{**person, "last_interaction_date": str|None}].
    None means never met yet, not neglected. Computed client-side over
    get_all_people()/get_all_interactions() rather than a SQL aggregation -
    consistent with how person_match.score_candidates() already does its
    matching client-side; fine at personal-app scale. Used by the Digest
    page to flag relationships that have gone quiet.
    """
    people = get_all_people(user_id)
    interactions = get_all_interactions(user_id)
    latest = {}
    for i in interactions:
        pid = i.get("person_id")
        d = i.get("date")
        if d and (pid not in latest or d > latest[pid]):
            latest[pid] = d
    return [{**p, "last_interaction_date": latest.get(p["id"])} for p in people]


# ---------- Interaction helpers ----------

def create_interaction(user_id: str, person_id, raw_text, date=None, location=None, appearance="",
                        summary="", sentiment=None, topics=None, extracted_facts=None,
                        embedding=None, geo_lat=None, geo_lng=None, geo_address=None, maps_url=None,
                        meeting_type="", decisions=None, concerns=None):
    resp = get_client().table("interaction").insert({
        "user_id": user_id,
        "person_id": person_id,
        "raw_text": raw_text,
        "date": date,
        "location": location,
        "appearance": appearance,
        "summary": summary,
        "sentiment": sentiment or [],           # list of {topic, sentiment} objects (jsonb)
        "topics": topics or [],
        "extracted_facts": extracted_facts or {},
        "embedding": embedding,                 # python list[float] or None -> pgvector `vector` column
        "geo_lat": geo_lat,                     # opt-in device location (see google_maps.py) - None unless the
        "geo_lng": geo_lng,                     # user tapped "Add my location" on this specific note
        "geo_address": geo_address,
        "maps_url": maps_url,
        "meeting_type": meeting_type,           # discovery/demo/negotiation/etc. - see extraction.py
        "decisions": decisions or [],           # settled outcomes, distinct from follow-up tasks
        "concerns": concerns or [],             # specific objections/hesitations raised
    }).execute()
    return resp.data[0]["id"]


def get_interactions_for_person(user_id: str, person_id):
    resp = (
        get_client().table("interaction")
        .select("*")
        .eq("person_id", person_id)
        .eq("user_id", user_id)
        .order("date")
        .execute()
    )
    return resp.data


def get_all_interactions(user_id: str):
    resp = get_client().table("interaction").select("*").eq("user_id", user_id).execute()
    return resp.data


def get_interactions_by_ids(user_id: str, ids: list):
    """Fetch full interaction rows for a list of ids - used by retrieval.py
    to hydrate the (id-only-ish) results of a vector similarity search back
    into full rows (raw_text, sentiment, topics, etc.) for the LLM to read."""
    if not ids:
        return []
    resp = get_client().table("interaction").select("*").in_("id", ids).eq("user_id", user_id).execute()
    return resp.data


def search_interactions_by_embedding(user_id: str, query_embedding, top_k=5, person_id=None):
    """
    Real vector similarity search, via the `match_interactions` Postgres
    function defined in schema.sql. That function uses pgvector's cosine
    distance operator (<=>) against the ivfflat ANN index on the embedding
    column - this is an actual vector-DB query executed inside Postgres,
    not a Python loop computing similarity over rows pulled into memory.

    Returns a list of dicts: [{id, person_id, raw_text, date, summary, similarity}, ...]
    ordered by similarity descending (closest matches first).
    """
    resp = get_client().rpc("match_interactions", {
        "query_embedding": query_embedding,
        "match_count": top_k,
        "filter_person_id": person_id,
        "filter_user_id": user_id,
    }).execute()
    return resp.data


# ---------- Task helpers ----------

def create_task(user_id: str, interaction_id, description, due_date=None, owner="me"):
    resp = get_client().table("task").insert({
        "user_id": user_id,
        "interaction_id": interaction_id,
        "description": description,
        "due_date": due_date,
        "owner": owner,          # 'me' or 'them' - see extraction.py's follow_ups[].owner
    }).execute()
    return resp.data[0]["id"]


def get_tasks_for_interactions(user_id: str, interaction_ids: list):
    """Fetch all task rows tied to any of the given interaction ids -
    used by retrieval.py to surface follow-ups alongside the interactions
    they came from."""
    if not interaction_ids:
        return []
    resp = get_client().table("task").select("*").in_("interaction_id", interaction_ids).eq("user_id", user_id).execute()
    return resp.data


def get_tasks_for_person(user_id: str, person_id: int):
    """Convenience wrapper: every task tied to any interaction with this
    person, regardless of which specific interaction it came from."""
    interactions = get_interactions_for_person(user_id, person_id)
    return get_tasks_for_interactions(user_id, [i["id"] for i in interactions])


def get_all_tasks_with_context(user_id: str, status: str = None):
    """
    Fetches every task joined with its interaction's date/summary and the
    person's id/name (via a PostgREST embedded select on the interaction_id
    / person_id foreign keys) - used by the Tasks dashboard so it can show
    who each follow-up is about without a separate round-trip per task.
    Optional `status` filter ('open'/'done'); None returns all statuses.
    Ordered by due_date (nulls last).
    """
    query = (
        get_client().table("task")
        .select("*, interaction(id, date, summary, person(id, name))")
        .eq("user_id", user_id)
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("due_date", nullsfirst=False).execute()
    return resp.data


def update_task_status(user_id: str, task_id: int, status: str):
    get_client().table("task").update({"status": status}).eq("id", task_id).eq("user_id", user_id).execute()


def update_task_owner(user_id: str, task_id: int, owner: str):
    get_client().table("task").update({"owner": owner}).eq("id", task_id).eq("user_id", user_id).execute()


def get_task(user_id: str, task_id: int):
    """Single task joined with its interaction's person name - used by
    google_calendar.create_event() to build a human-readable event
    summary (e.g. "Rohan: send updated document")."""
    resp = (
        get_client().table("task")
        .select("*, interaction(id, person(id, name))")
        .eq("id", task_id).eq("user_id", user_id).single().execute()
    )
    return resp.data


def set_task_calendar_event(user_id: str, task_id: int, calendar_event_id):
    """calendar_event_id=None clears it (used when removing a task from
    Google Calendar)."""
    get_client().table("task").update({"calendar_event_id": calendar_event_id}).eq("id", task_id).eq("user_id", user_id).execute()


# ---------- Google Calendar credentials (per-user OAuth tokens) ----------

def get_google_credentials(user_id: str):
    resp = get_client().table("google_credentials").select("*").eq("user_id", user_id).execute()
    return resp.data[0] if resp.data else None


def upsert_google_credentials(user_id: str, access_token: str, refresh_token: str, expires_at: str, scope: str):
    get_client().table("google_credentials").upsert({
        "user_id": user_id,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
        "scope": scope,
    }).execute()


def update_google_access_token(user_id: str, access_token: str, expires_at: str):
    """Called after a refresh - refresh_token itself doesn't change."""
    get_client().table("google_credentials").update({
        "access_token": access_token,
        "expires_at": expires_at,
    }).eq("user_id", user_id).execute()


def delete_google_credentials(user_id: str):
    get_client().table("google_credentials").delete().eq("user_id", user_id).execute()


# ---------- OAuth state nonces (bridges the authenticated-API / ----------
# ---------- unauthenticated-redirect gap in the Calendar connect flow) --

def create_oauth_state(state: str, user_id: str):
    get_client().table("oauth_state").insert({"state": state, "user_id": user_id}).execute()


def consume_oauth_state(state: str):
    """Looks up + deletes the nonce in one round trip (single-use).
    Returns the user_id it belonged to, or None if the nonce doesn't
    exist (already used, never existed - e.g. a forged callback) or is
    older than 10 minutes (treated as expired)."""
    resp = get_client().table("oauth_state").select("user_id, created_at").eq("state", state).execute()
    if not resp.data:
        return None
    get_client().table("oauth_state").delete().eq("state", state).execute()
    row = resp.data[0]
    created_at = datetime.fromisoformat(row["created_at"])
    if datetime.now(timezone.utc) - created_at > timedelta(minutes=10):
        return None
    return row["user_id"]


# ---------- Person management (editing/merging) ----------

def get_person(user_id: str, person_id: int):
    resp = get_client().table("person").select("*").eq("id", person_id).eq("user_id", user_id).single().execute()
    return resp.data


def update_person(user_id: str, person_id: int, **fields):
    """
    Explicit overwrite of the given person fields. Unlike
    update_person_description() (which APPENDS, for passive enrichment from
    new notes), this REPLACES the given fields outright - used by the
    People page's edit form, where the user is deliberately correcting a
    stored value rather than adding an observation.
    """
    if fields:
        get_client().table("person").update(fields).eq("id", person_id).eq("user_id", user_id).execute()


def delete_person(user_id: str, person_id: int):
    """Deletes a Person row. interaction rows (and, transitively, their
    task rows) cascade-delete per the ON DELETE CASCADE constraints in
    schema.sql."""
    get_client().table("person").delete().eq("id", person_id).eq("user_id", user_id).execute()


def merge_persons(user_id: str, source_id: int, target_id: int):
    """
    Merges `source_id` into `target_id`: reassigns all of source's
    interactions to target, unions aliases/tags, appends source's
    description onto target's (same append convention as
    update_person_description), keeps target's role/company unless empty
    (falling back to source's), keeps the earlier first_met_date, then
    deletes the source row. Returns target_id.
    """
    source = get_person(user_id, source_id)
    target = get_person(user_id, target_id)
    if not source or not target:
        raise ValueError("Both source and target people must exist to merge.")

    (
        get_client().table("interaction").update({"person_id": target_id})
        .eq("person_id", source_id).eq("user_id", user_id).execute()
    )

    merged_aliases = list(dict.fromkeys(
        (target.get("aliases") or []) + [source["name"]] + (source.get("aliases") or [])
    ))
    merged_tags = list(dict.fromkeys((target.get("tags") or []) + (source.get("tags") or [])))

    merged_description = target.get("description") or ""
    if source.get("description"):
        merged_description = (
            (merged_description + "\n" + source["description"]).strip()
            if merged_description else source["description"]
        )

    merged_role = target.get("role") or source.get("role") or ""
    merged_company = target.get("company") or source.get("company") or ""

    dates = [d for d in [target.get("first_met_date"), source.get("first_met_date")] if d]
    merged_first_met = min(dates) if dates else None

    update_person(
        user_id,
        target_id,
        aliases=merged_aliases,
        tags=merged_tags,
        description=merged_description,
        role=merged_role,
        company=merged_company,
        first_met_date=merged_first_met,
    )
    delete_person(user_id, source_id)
    return target_id


# ---------- Interaction management (editing) ----------

def update_interaction(user_id: str, interaction_id: int, **fields):
    """Explicit overwrite of the given interaction fields - used by the
    People page's per-interaction edit form to correct a mistake."""
    if fields:
        get_client().table("interaction").update(fields).eq("id", interaction_id).eq("user_id", user_id).execute()


def delete_interaction(user_id: str, interaction_id: int):
    """Deletes an Interaction row. Its task rows cascade-delete per the
    ON DELETE CASCADE constraint in schema.sql."""
    get_client().table("interaction").delete().eq("id", interaction_id).eq("user_id", user_id).execute()


# ---------- Secondary-person links (other_people) ----------

def link_interaction_person(user_id: str, interaction_id: int, person_id: int, relation: str = ""):
    """Links a person mentioned in a note besides its primary person (e.g.
    "Rhea, Priya's sister") to that interaction - see
    capture.py's resolve_and_link_other_people()."""
    get_client().table("interaction_person").insert({
        "user_id": user_id,
        "interaction_id": interaction_id,
        "person_id": person_id,
        "relation": relation,
    }).execute()


def get_secondary_interactions_for_person(user_id: str, person_id: int):
    """
    Fetches interactions where this person was mentioned as a SECONDARY
    person (linked via interaction_person), not the interaction's primary
    person - e.g. "Rhea" showing up as "Priya's sister" in a note primarily
    about Priya. Each row includes the relation text plus the primary
    interaction's own data and the primary person's name (via a nested
    embedded select), so callers can distinguish "you talked to them
    directly" from "they were mentioned".
    """
    resp = (
        get_client().table("interaction_person")
        .select(
            "relation, interaction(id, date, created_at, summary, raw_text, "
            "location, appearance, sentiment, topics, extracted_facts, person(id, name))"
        )
        .eq("person_id", person_id)
        .eq("user_id", user_id)
        .execute()
    )
    return resp.data


if __name__ == "__main__":
    # Quick connectivity check: confirms env vars are set and the tables
    # from schema.sql exist.
    client = get_client()
    resp = client.table("person").select("id").limit(1).execute()
    print("Connected to Supabase successfully. `person` table is reachable.")
