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
from typing import Optional

from supabase import create_client, Client

import crypto_utils

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


# ---------- Encrypt-at-rest (see crypto_utils.py + schema.sql section 22) ----------
#
# Content fields get encrypted before every insert/update and decrypted
# after every select, centralized here at the row boundary rather than at
# each of the 20+ individual call sites below - so every caller above
# db.py (retrieval.py, extraction.py, morning_brief.py, google_calendar.py,
# every api/routers/*.py) keeps seeing plain Python strings, unchanged.
#
# Deliberately NOT encrypted: person.name/aliases/role/company/phone/
# email/tags, initiative.name - these are used for real server-side
# matching (candidate resolution, ilike company grouping, alias lookup);
# encrypting them would break that matching, and they're materially less
# sensitive than the actual note content.

_ENCRYPTED_TEXT_FIELDS = {
    "person": ["description"],
    "interaction": ["raw_text", "summary", "location", "appearance", "geo_address"],
    "task": ["description"],
    "google_credentials": ["access_token", "refresh_token"],
}
_ENCRYPTED_JSON_FIELDS = {
    "person": ["personal_notes"],
    "interaction": ["sentiment", "topics", "extracted_facts", "decisions", "concerns"],
}


def _encrypt_fields(table: str, fields: dict) -> dict:
    """Returns a copy of `fields` with any flagged keys ENCRYPTED IN PLACE
    OF their plaintext value. Only touches keys actually present, so this
    is safe to call on a partial update() dict as well as a full insert
    dict."""
    out = dict(fields)
    for key in _ENCRYPTED_TEXT_FIELDS.get(table, []):
        if key in out:
            out[key] = crypto_utils.encrypt(out[key])
    for key in _ENCRYPTED_JSON_FIELDS.get(table, []):
        if key in out:
            out[key] = crypto_utils.encrypt_json(out[key])
    return out


def _decrypt_row(table: str, row: Optional[dict]) -> Optional[dict]:
    """Decrypts a row IN PLACE and returns it. Also walks one level into
    any embedded-select joins (get_all_tasks_with_context's nested
    interaction/person, get_all_interactions_with_context's person/
    initiative, etc.) since PostgREST inlines those as nested dicts on
    the same row."""
    if row is None:
        return row
    for key in _ENCRYPTED_TEXT_FIELDS.get(table, []):
        if row.get(key) is not None:
            row[key] = crypto_utils.decrypt(row[key])
    for key in _ENCRYPTED_JSON_FIELDS.get(table, []):
        if row.get(key) is not None:
            row[key] = crypto_utils.decrypt_json(row[key])
    if isinstance(row.get("person"), dict):
        _decrypt_row("person", row["person"])
    if isinstance(row.get("interaction"), dict):
        _decrypt_row("interaction", row["interaction"])
    return row


def _decrypt_rows(table: str, rows: list) -> list:
    return [_decrypt_row(table, r) for r in rows]


# ---------- Person helpers ----------

def get_all_people(user_id: str):
    resp = get_client().table("person").select("*").eq("user_id", user_id).execute()
    return _decrypt_rows("person", resp.data)


def get_people_by_company(user_id: str, company: str):
    """Case-insensitive exact match on company (ilike with no wildcards in
    `company` behaves as case-insensitive equality) - deliberately not
    fuzzy, since company names typed inconsistently (e.g. "Acme" vs "Acme
    Corp") should be a follow-up if it turns out to matter in practice,
    not guessed at upfront."""
    resp = (
        get_client().table("person").select("*")
        .eq("user_id", user_id).ilike("company", company)
        .execute()
    )
    return _decrypt_rows("person", resp.data)


def create_person(user_id: str, name, description="", role="", company="", phone="", email="",
                   aliases=None, tags=None, first_met_date=None, personal_notes=None):
    """`personal_notes` is a list of {"date": ..., "note": ...} entries (a
    dated timeline, not a text blob - see schema.sql section 16). Callers
    building the first entry from a freshly-captured note should pass
    e.g. [{"date": interaction_date, "note": text}]."""
    resp = get_client().table("person").insert(_encrypt_fields("person", {
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
        "personal_notes": personal_notes or [],
    })).execute()
    return resp.data[0]["id"]


def update_person_description(user_id: str, person_id, new_description):
    """Passive enrichment: append new observations rather than overwrite."""
    client = get_client()
    row = (
        client.table("person").select("description")
        .eq("id", person_id).eq("user_id", user_id).single().execute()
    )
    existing = crypto_utils.decrypt((row.data or {}).get("description")) or ""
    merged = (existing + "\n" + new_description).strip() if existing else new_description
    client.table("person").update(_encrypt_fields("person", {"description": merged})).eq("id", person_id).eq("user_id", user_id).execute()


def update_person_personal_notes(user_id: str, person_id, new_note, entry_date):
    """Appends one dated entry to the personal-notes timeline (jsonb list
    of {"date", "note"}) rather than overwriting - kept as a separate
    column from `description` so briefings can draw on personal details
    without them polluting the professional field. Unlike the old
    text-append convention, each entry keeps its own date so staleness
    (e.g. a pregnancy mentioned 6 months ago) can be judged later instead
    of silently merging into one undated paragraph."""
    client = get_client()
    row = (
        client.table("person").select("personal_notes")
        .eq("id", person_id).eq("user_id", user_id).single().execute()
    )
    existing = crypto_utils.decrypt_json((row.data or {}).get("personal_notes")) or []
    updated = existing + [{"date": entry_date, "note": new_note}]
    client.table("person").update(_encrypt_fields("person", {"personal_notes": updated})).eq("id", person_id).eq("user_id", user_id).execute()


def delete_person_personal_note(user_id: str, person_id, entry_index: int):
    """Removes one entry from the personal-notes timeline by its current
    position - lets the user drop a note that's become stale/wrong (e.g.
    tied to a job they've since left) rather than leaving it dated-and-
    misleading forever."""
    client = get_client()
    row = (
        client.table("person").select("personal_notes")
        .eq("id", person_id).eq("user_id", user_id).single().execute()
    )
    existing = crypto_utils.decrypt_json((row.data or {}).get("personal_notes")) or []
    if 0 <= entry_index < len(existing):
        updated = existing[:entry_index] + existing[entry_index + 1:]
        client.table("person").update(_encrypt_fields("person", {"personal_notes": updated})).eq("id", person_id).eq("user_id", user_id).execute()


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

def create_interaction(user_id: str, person_id=None, raw_text="", date=None, location=None, appearance="",
                        summary="", sentiment=None, topics=None, extracted_facts=None,
                        embedding=None, geo_lat=None, geo_lng=None, geo_address=None, maps_url=None,
                        meeting_type="", decisions=None, concerns=None, initiative_id=None):
    resp = get_client().table("interaction").insert(_encrypt_fields("interaction", {
        "user_id": user_id,
        "person_id": person_id,                 # None for a standalone note not about any specific person
        "raw_text": raw_text,
        "date": date,
        "location": location,
        "appearance": appearance,
        "summary": summary,
        "sentiment": sentiment or [],           # list of {topic, sentiment} objects (encrypted JSON text)
        "topics": topics or [],
        "extracted_facts": extracted_facts or {},
        "embedding": embedding,                 # python list[float] or None -> pgvector `vector` column.
                                                 # Computed from PLAINTEXT raw_text by the caller before this
                                                 # insert (see api/routers/capture.py) - never encrypted itself.
        "geo_lat": geo_lat,                     # opt-in device location (see google_maps.py) - None unless the
        "geo_lng": geo_lng,                     # user tapped "Add my location" on this specific note
        "geo_address": geo_address,
        "maps_url": maps_url,
        "meeting_type": meeting_type,           # discovery/demo/negotiation/etc. - see extraction.py
        "decisions": decisions or [],           # settled outcomes, distinct from follow-up tasks
        "concerns": concerns or [],             # specific objections/hesitations raised
        "initiative_id": initiative_id,         # which user-managed initiative this note belongs to, if any
    })).execute()
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
    return _decrypt_rows("interaction", resp.data)


def get_all_interactions(user_id: str):
    resp = get_client().table("interaction").select("*").eq("user_id", user_id).execute()
    return _decrypt_rows("interaction", resp.data)


def get_all_interactions_with_context(user_id: str):
    """Every interaction for this user - person-linked or standalone -
    joined with its person's id/name (null for a standalone note) and its
    initiative's id/name/color (null for Uncategorized), via a PostgREST
    embedded select on the existing FK constraints (same pattern
    get_all_tasks_with_context already uses for its person join). This is
    the Notes page's data source - the one place a person-less note is
    guaranteed to be visible, since it can't appear on any person's own
    timeline. Ordered newest-first."""
    resp = (
        get_client().table("interaction")
        .select("*, person(id, name), initiative(id, name, color)")
        .eq("user_id", user_id)
        .order("date", desc=True, nullsfirst=False)
        .execute()
    )
    return _decrypt_rows("interaction", resp.data)


def get_interactions_by_ids(user_id: str, ids: list):
    """Fetch full interaction rows for a list of ids - used by retrieval.py
    to hydrate the (id-only-ish) results of a vector similarity search back
    into full rows (raw_text, sentiment, topics, etc.) for the LLM to read."""
    if not ids:
        return []
    resp = get_client().table("interaction").select("*").in_("id", ids).eq("user_id", user_id).execute()
    return _decrypt_rows("interaction", resp.data)


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
    return _decrypt_rows("interaction", resp.data)


# ---------- Task helpers ----------

def create_task(user_id: str, interaction_id, description, due_date=None, owner="me", person_id=None):
    resp = get_client().table("task").insert(_encrypt_fields("task", {
        "user_id": user_id,
        "interaction_id": interaction_id,
        "description": description,
        "due_date": due_date,
        "owner": owner,          # 'me' or 'them' - see extraction.py's follow_ups[].owner
        "person_id": person_id,  # who this SPECIFIC task is about, if not the interaction's primary
                                  # person - None means "use the interaction's primary person" (the
                                  # common case), see api/routers/capture.py's _resolve_task_person
    })).execute()
    return resp.data[0]["id"]


def get_tasks_for_interactions(user_id: str, interaction_ids: list):
    """Fetch all task rows tied to any of the given interaction ids -
    used by retrieval.py to surface follow-ups alongside the interactions
    they came from."""
    if not interaction_ids:
        return []
    resp = get_client().table("task").select("*").in_("interaction_id", interaction_ids).eq("user_id", user_id).execute()
    return _decrypt_rows("task", resp.data)


def get_tasks_for_person(user_id: str, person_id: int):
    """Convenience wrapper: every task tied to any interaction with this
    person, regardless of which specific interaction it came from."""
    interactions = get_interactions_for_person(user_id, person_id)
    return get_tasks_for_interactions(user_id, [i["id"] for i in interactions])


def get_all_tasks_with_context(user_id: str, status: str = None):
    """
    Fetches every task joined with its interaction's date/summary/person/
    initiative AND the task's own directly-linked person (task.person_id -
    who this SPECIFIC follow-up is about, when that's someone other than
    the interaction's primary person; null when it isn't, meaning "use the
    interaction's primary person" as before) - used by the Tasks dashboard
    so it can show who each follow-up is really about without a separate
    round-trip per task. The interaction's initiative is included too, so
    a task from a person-less note (e.g. "enroll in Zumba class") can show
    "Fitness" instead of a misleading "Unknown" - there's no person to
    show because there genuinely isn't one, not because of missing data.
    Optional `status` filter ('open'/'done'); None returns all statuses.
    Ordered by due_date (nulls last).
    """
    query = (
        get_client().table("task")
        .select("*, interaction(id, date, summary, person(id, name), initiative(id, name)), person(id, name)")
        .eq("user_id", user_id)
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("due_date", nullsfirst=False).execute()
    return _decrypt_rows("task", resp.data)


def update_task_status(user_id: str, task_id: int, status: str):
    get_client().table("task").update({"status": status}).eq("id", task_id).eq("user_id", user_id).execute()


def update_task_owner(user_id: str, task_id: int, owner: str):
    get_client().table("task").update({"owner": owner}).eq("id", task_id).eq("user_id", user_id).execute()


def get_task(user_id: str, task_id: int):
    """Single task joined with its interaction's person name AND its own
    directly-linked person (see get_all_tasks_with_context) - used by
    google_calendar.create_event() to build a human-readable event
    summary (e.g. "Rohan: send updated document"), preferring the task's
    own person over the interaction's primary one when both exist."""
    resp = (
        get_client().table("task")
        .select("*, interaction(id, person(id, name)), person(id, name)")
        .eq("id", task_id).eq("user_id", user_id).single().execute()
    )
    return _decrypt_row("task", resp.data)


def set_task_calendar_event(user_id: str, task_id: int, calendar_event_id):
    """calendar_event_id=None clears it (used when removing a task from
    Google Calendar)."""
    get_client().table("task").update({"calendar_event_id": calendar_event_id}).eq("id", task_id).eq("user_id", user_id).execute()


# ---------- Google Calendar credentials (per-user OAuth tokens) ----------

def get_google_credentials(user_id: str):
    resp = get_client().table("google_credentials").select("*").eq("user_id", user_id).execute()
    return _decrypt_row("google_credentials", resp.data[0]) if resp.data else None


def upsert_google_credentials(user_id: str, access_token: str, refresh_token: str, expires_at: str, scope: str):
    get_client().table("google_credentials").upsert(_encrypt_fields("google_credentials", {
        "user_id": user_id,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
        "scope": scope,
    })).execute()


def update_google_access_token(user_id: str, access_token: str, expires_at: str):
    """Called after a refresh - refresh_token itself doesn't change."""
    get_client().table("google_credentials").update(_encrypt_fields("google_credentials", {
        "access_token": access_token,
        "expires_at": expires_at,
    })).eq("user_id", user_id).execute()


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
    return _decrypt_row("person", resp.data)


def update_person(user_id: str, person_id: int, **fields):
    """
    Explicit overwrite of the given person fields. Unlike
    update_person_description() (which APPENDS, for passive enrichment from
    new notes), this REPLACES the given fields outright - used by the
    People page's edit form, where the user is deliberately correcting a
    stored value rather than adding an observation.
    """
    if fields:
        get_client().table("person").update(_encrypt_fields("person", fields)).eq("id", person_id).eq("user_id", user_id).execute()


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
        get_client().table("interaction").update(_encrypt_fields("interaction", fields)).eq("id", interaction_id).eq("user_id", user_id).execute()


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
    for row in resp.data:
        _decrypt_row("interaction", row.get("interaction"))
    return resp.data



# ---------- User preferences (theme, font size, Terms acceptance) ----------

def get_user_preference(user_id: str) -> dict:
    """Fetches the user's settings row, creating a default one on first
    read - simpler than a signup-time hook, and every existing account
    (which predates this table) needs to transparently get one too."""
    resp = get_client().table("user_preference").select("*").eq("user_id", user_id).execute()
    if resp.data:
        return resp.data[0]
    resp = get_client().table("user_preference").insert({"user_id": user_id}).execute()
    return resp.data[0]


def update_user_preference(user_id: str, **fields) -> dict:
    """Upserts so this works whether or not get_user_preference() has
    already created the row for this user."""
    row = {"user_id": user_id, "updated_at": datetime.now(timezone.utc).isoformat(), **fields}
    resp = get_client().table("user_preference").upsert(row).execute()
    return resp.data[0]


def get_user_email(user_id: str) -> str:
    """Looks up the account's login email via the Auth admin API (not
    stored redundantly in `person`/`user_preference`) - used by
    morning_brief.py to know where to send the daily brief."""
    user = get_client().auth.admin.get_user_by_id(user_id)
    return user.user.email


def delete_account(user_id: str) -> None:
    """Permanently deletes the account and every row of their data - the
    Play Store's required "delete my account and data" action (see
    api/routers/settings.py's DELETE /account). Only needs to delete the
    auth.users row itself: every app table (person, interaction, task,
    interaction_person, google_credentials, oauth_state, user_preference,
    initiative) declares its user_id column `references auth.users(id)
    on delete cascade` in schema.sql, so Postgres cascades the rest for
    free - no per-table cleanup to keep in sync here as new tables are
    added. Uses the Auth admin API (same service-role client as
    get_user_email above), since deleting another auth user is an
    admin-only operation - a user can never do this to anyone but
    themselves, enforced by api/auth.py resolving `user_id` from their
    own verified session token, never a client-supplied value."""
    get_client().auth.admin.delete_user(user_id)


def get_users_with_daily_brief_enabled() -> list:
    """Every user_id that's opted into the scheduled daily-brief email
    (see schema.sql section 19) - used by the cron-triggered
    POST /api/brief/send-daily-emails, which has no single logged-in user
    to scope to."""
    resp = get_client().table("user_preference").select("user_id").eq("daily_brief_email_enabled", True).execute()
    return [row["user_id"] for row in resp.data]


# ---------- Initiatives (user-managed note categories - schema.sql section 20) ----------

DEFAULT_INITIATIVES = ["Tenaxis AI", "Personal", "Job", "Fitness"]


def get_initiatives(user_id: str) -> list:
    """Every initiative for this user, seeding the 4 starter initiatives
    on first read if none exist yet - same create-default-on-first-read
    shape as get_user_preference(), so this works for the existing
    account and any future signup with no separate seed step needed."""
    resp = get_client().table("initiative").select("*").eq("user_id", user_id).order("created_at").execute()
    if resp.data:
        return resp.data
    rows = [{"user_id": user_id, "name": name} for name in DEFAULT_INITIATIVES]
    resp = get_client().table("initiative").insert(rows).execute()
    return resp.data


def get_initiative(user_id: str, initiative_id: int):
    """Single-initiative lookup by id - used by capture.py's
    _finish_capture_storage() to report which initiative a note actually
    landed in (name, not just the id) back to the chat UI. Returns None
    if it doesn't exist (deleted between resolving initiative_id and this
    lookup, or a bad id) rather than raising - this isn't a hard
    dependency of the capture flow, just extra display info, so a miss
    here shouldn't fail the whole request the way it would for a
    person/task lookup. `.single()` raises on zero rows (same convention
    as get_person/get_task elsewhere in this file), so that's caught here
    specifically instead of switching query styles just for this one
    optional lookup."""
    try:
        resp = (
            get_client().table("initiative").select("*")
            .eq("id", initiative_id).eq("user_id", user_id).single().execute()
        )
        return resp.data
    except Exception:
        return None


def create_initiative(user_id: str, name: str, color: str = None) -> dict:
    """Raises ValueError if an initiative with this name already exists
    for this user (case-insensitive) - checked here in Python rather than
    catching a Postgres unique-violation, matching this file's existing
    straight-line style."""
    existing = get_initiatives(user_id)
    if any(i["name"].strip().lower() == name.strip().lower() for i in existing):
        raise ValueError(f"An initiative named '{name}' already exists.")
    resp = get_client().table("initiative").insert({"user_id": user_id, "name": name, "color": color}).execute()
    return resp.data[0]


def update_initiative(user_id: str, initiative_id: int, **fields) -> dict:
    if fields:
        get_client().table("initiative").update(fields).eq("id", initiative_id).eq("user_id", user_id).execute()
    resp = get_client().table("initiative").select("*").eq("id", initiative_id).eq("user_id", user_id).single().execute()
    return resp.data


def delete_initiative(user_id: str, initiative_id: int) -> None:
    """interaction.initiative_id is ON DELETE SET NULL, so every note
    tagged with this initiative falls back to Uncategorized rather than
    being deleted or left dangling."""
    get_client().table("initiative").delete().eq("id", initiative_id).eq("user_id", user_id).execute()


def get_initiative_by_name(user_id: str, name: str):
    """Case-insensitive exact-name lookup (ilike with no wildcards
    behaves as case-insensitive equality - same trick
    get_people_by_company already uses) - used by capture.py to resolve
    extraction.py's classified initiative name back to an id. Returns
    None if there's no match."""
    resp = get_client().table("initiative").select("*").eq("user_id", user_id).ilike("name", name).execute()
    return resp.data[0] if resp.data else None


# ---------- Subscriptions & usage metering (schema.sql section 24, see entitlements.py) ----------

def get_subscription(user_id: str) -> dict:
    """Fetches the account's subscription row, creating a default 'free'
    one on first read - same create-on-first-read pattern as
    get_user_preference() above, so every existing account (which
    predates this table) transparently gets one without a migration
    backfill script."""
    resp = get_client().table("subscription").select("*").eq("user_id", user_id).execute()
    if resp.data:
        return resp.data[0]
    resp = get_client().table("subscription").insert({"user_id": user_id}).execute()
    return resp.data[0]


def upsert_subscription(user_id: str, **fields) -> dict:
    """Used by the billing webhook handler to write the whole
    provider-reported state at once (tier/status/provider ids/period
    end) - a webhook always knows the full current state, not a partial
    patch, so this mirrors that rather than offering field-by-field
    updaters."""
    row = {"user_id": user_id, "updated_at": datetime.now(timezone.utc).isoformat(), **fields}
    resp = get_client().table("subscription").upsert(row).execute()
    return resp.data[0]


def get_usage_count(user_id: str, resource: str, period: str) -> int:
    """`period` is the first day of a calendar month (YYYY-MM-01) - see
    entitlements.py's _current_period(). Returns 0 for a month with no
    rows yet rather than creating one, since a pure read shouldn't have a
    write side effect."""
    resp = (
        get_client().table("usage_counter").select("count")
        .eq("user_id", user_id).eq("resource", resource).eq("period", period)
        .execute()
    )
    return resp.data[0]["count"] if resp.data else 0


def increment_usage(user_id: str, resource: str, period: str) -> int:
    """Atomically bumps this month's counter for (user, resource) by one,
    creating the row if this is the first use this month. Uses Postgres's
    own upsert-with-increment (via the increment_usage_counter() SQL
    function, schema.sql section 24) rather than a read-then-write from
    Python, which would race under concurrent requests (e.g. two rapid
    captures) and could under-count. Returns the count AFTER
    incrementing."""
    resp = get_client().rpc(
        "increment_usage_counter", {"p_user_id": user_id, "p_resource": resource, "p_period": period}
    ).execute()
    return resp.data


if __name__ == "__main__":
    # Quick connectivity check: confirms env vars are set and the tables
    # from schema.sql exist.
    client = get_client()
    resp = client.table("person").select("id").limit(1).execute()
    print("Connected to Supabase successfully. `person` table is reachable.")
