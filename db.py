"""
db.py — Supabase (Postgres + pgvector) storage layer for the "MyConfía" prototype.

Replaces the earlier local-SQLite version. Structured data (Interaction,
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

Note: jsonb columns (sentiment, topics, extracted_facts) are
sent/received as native Python lists/dicts here - the supabase-py client
handles JSON (de)serialization automatically, so there's no more manual
json.dumps/json.loads anywhere in this file (unlike the old SQLite version).

Multi-user note: every function below that touches interaction/task
takes an explicit `user_id` and either filters by it
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
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

from supabase import create_client, Client

import crypto_utils

# One Supabase client PER THREAD, not one for the whole process. The client
# keeps a single HTTP/2 connection open, and that connection is not safe to
# share between threads. This app is heavily threaded (the request thread-pool,
# the search-index worker, the agent's parallel tools), and a
# measured 8-thread read test through one shared client failed ~11% of calls
# with "ReadError: Resource temporarily unavailable" - the cause of notes whose
# details were only partly saved. Each thread making its own client removes the
# sharing, and the failures with it.
_local = threading.local()


def get_client() -> Client:
    client = getattr(_local, "client", None)
    if client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL / SUPABASE_KEY environment variables not set. "
                "Create a free project at https://supabase.com, run schema.sql "
                "in the SQL editor, then set these env vars. See README.md."
            )
        client = _local.client = create_client(url, key)
    return client


# ---------- Encrypt-at-rest (see crypto_utils.py + schema.sql section 22) ----------
#
# Content fields get encrypted before every insert/update and decrypted
# after every select, centralized here at the row boundary rather than at
# each of the individual call sites below - so every caller above
# db.py (retrieval.py, extraction.py, morning_brief.py, every
# api/routers/*.py) keeps seeing plain Python strings, unchanged.
#
# Deliberately NOT encrypted: initiative.name - it is used for real
# server-side matching; encrypting it would break that matching, and it
# is materially less sensitive than the actual note content.

_ENCRYPTED_TEXT_FIELDS = {
    "interaction": ["raw_text", "summary", "location", "appearance", "geo_address"],
    "task": ["description"],
    "search_chunk": ["title", "text"],
    "daily_brief": ["brief"],
}
_ENCRYPTED_JSON_FIELDS = {
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
    the embedded interaction of a task (get_all_tasks_with_context) since
    PostgREST inlines joins as nested dicts on the same row."""
    if row is None:
        return row
    for key in _ENCRYPTED_TEXT_FIELDS.get(table, []):
        if row.get(key) is not None:
            row[key] = crypto_utils.decrypt(row[key])
    for key in _ENCRYPTED_JSON_FIELDS.get(table, []):
        if row.get(key) is not None:
            row[key] = crypto_utils.decrypt_json(row[key])
    if isinstance(row.get("interaction"), dict):
        _decrypt_row("interaction", row["interaction"])
    return row


def _decrypt_rows(table: str, rows: list) -> list:
    return [_decrypt_row(table, r) for r in rows]


# ---------- Interaction helpers ----------

def create_interaction(user_id: str, raw_text="", date=None, location=None, appearance="",
                        summary="", sentiment=None, topics=None, extracted_facts=None,
                        embedding=None, geo_lat=None, geo_lng=None, geo_address=None, maps_url=None,
                        decisions=None, concerns=None, initiative_id=None):
    resp = get_client().table("interaction").insert(_encrypt_fields("interaction", {
        "user_id": user_id,
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
        "decisions": decisions or [],           # settled outcomes, distinct from follow-up tasks
        "concerns": concerns or [],             # specific objections/hesitations raised
        "initiative_id": initiative_id,         # which user-managed initiative this note belongs to, if any
    })).execute()
    return resp.data[0]["id"]


def get_all_interactions(user_id: str):
    resp = get_client().table("interaction").select("*").eq("user_id", user_id).execute()
    return _decrypt_rows("interaction", resp.data)


def get_all_interactions_with_context(user_id: str):
    """Every interaction for this user -
    joined with its initiative's id/name/color (null for Uncategorized),
    via a PostgREST embedded select on the existing FK constraint. This is
    the Notes page's data source. Ordered newest-first."""
    resp = (
        get_client().table("interaction")
        .select("*, initiative(id, name, color)")
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


def search_interactions_by_embedding(user_id: str, query_embedding, top_k=5):
    """
    Real vector similarity search, via the `match_interactions` Postgres
    function defined in schema.sql. That function uses pgvector's cosine
    distance operator (<=>) against the ivfflat ANN index on the embedding
    column - this is an actual vector-DB query executed inside Postgres,
    not a Python loop computing similarity over rows pulled into memory.

    Returns a list of dicts: [{id, raw_text, date, summary, similarity}, ...]
    ordered by similarity descending (closest matches first).
    """
    resp = get_client().rpc("match_interactions", {
        "query_embedding": query_embedding,
        "match_count": top_k,
        "filter_person_id": None,
        "filter_user_id": user_id,
    }).execute()
    return _decrypt_rows("interaction", resp.data)


# ---------- Task helpers ----------

def create_task(user_id: str, interaction_id, description, due_date=None, owner="me", due_time=None):
    row = {
        "user_id": user_id,
        "interaction_id": interaction_id,
        "description": description,
        "due_date": due_date,
        "owner": owner,          # 'me' or 'them' - see extraction.py's follow_ups[].owner
    }
    if due_time:  # only sent when there is one: the column exists once schema.sql section 32 has run
        row["due_time"] = due_time
    try:
        resp = get_client().table("task").insert(_encrypt_fields("task", row)).execute()
    except Exception as e:
        if "due_time" not in row or "due_time" not in str(e):
            raise
        print(f"[warn] task.due_time column missing (run schema.sql section 32) - saving the task without its time: {e}")
        row.pop("due_time")
        resp = get_client().table("task").insert(_encrypt_fields("task", row)).execute()
    return resp.data[0]["id"]


def get_tasks_for_interactions(user_id: str, interaction_ids: list):
    """Fetch all task rows tied to any of the given interaction ids -
    used by retrieval.py and agent.py to surface tasks alongside the
    notes they came from."""
    if not interaction_ids:
        return []
    resp = get_client().table("task").select("*").in_("interaction_id", interaction_ids).eq("user_id", user_id).execute()
    return _decrypt_rows("task", resp.data)


def get_all_tasks_with_context(user_id: str, status: str = None):
    """
    Fetches every task joined with its note's date/summary/initiative - used
    by the Today page and the agenda so each task can show which category it
    belongs to without a separate round-trip per task.
    Optional `status` filter ('open'/'done'); None returns all statuses.
    Ordered by due_date (nulls last).
    """
    query = (
        get_client().table("task")
        .select("*, interaction(id, date, summary, initiative(id, name))")
        .eq("user_id", user_id)
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("due_date", nullsfirst=False).execute()
    return _decrypt_rows("task", resp.data)


def update_task_status(user_id: str, task_id: int, status: str):
    get_client().table("task").update({"status": status}).eq("id", task_id).eq("user_id", user_id).execute()


def update_task_fields(user_id: str, task_id: int, **fields):
    """Edits a task's wording and/or deadline (description, due_date, due_time - a
    null clears one). Only the keys passed are touched."""
    if fields:
        get_client().table("task").update(_encrypt_fields("task", fields)).eq("id", task_id).eq("user_id", user_id).execute()


def update_task_owner(user_id: str, task_id: int, owner: str):
    get_client().table("task").update({"owner": owner}).eq("id", task_id).eq("user_id", user_id).execute()


def get_task(user_id: str, task_id: int):
    """Single task by id (None-safe via .single() raising if absent)."""
    resp = get_client().table("task").select("*").eq("id", task_id).eq("user_id", user_id).single().execute()
    return _decrypt_row("task", resp.data)


# ---------- Interaction management (editing) ----------

def update_interaction(user_id: str, interaction_id: int, **fields):
    """Explicit overwrite of the given interaction fields - used by the
    Notes page's edit form to correct a mistake."""
    if fields:
        get_client().table("interaction").update(_encrypt_fields("interaction", fields)).eq("id", interaction_id).eq("user_id", user_id).execute()


def delete_interaction(user_id: str, interaction_id: int):
    """Deletes an Interaction row. Its task rows cascade-delete per the
    ON DELETE CASCADE constraint in schema.sql."""
    get_client().table("interaction").delete().eq("id", interaction_id).eq("user_id", user_id).execute()


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
    stored redundantly in `user_preference`) - used by
    morning_brief.py to know where to send the daily brief."""
    user = get_client().auth.admin.get_user_by_id(user_id)
    return user.user.email


def delete_account(user_id: str) -> None:
    """Permanently deletes the account and every row of their data - the
    Play Store's required "delete my account and data" action (see
    api/routers/settings.py's DELETE /account). Only needs to delete the
    auth.users row itself: every app table (interaction, task,
    user_preference, initiative, ...) declares its user_id column `references auth.users(id)
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

DEFAULT_INITIATIVES = ["Personal", "Work"]


def get_initiatives(user_id: str) -> list:
    """Every initiative for this user, seeding the 2 starter initiatives
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
    task lookup. `.single()` raises on zero rows (same convention
    as get_task elsewhere in this file), so that's caught here
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
    behaves as case-insensitive equality) - used by capture.py to resolve
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


# ---------- Unified search index (schema.sql section 28, search_index.py) ----------

def upsert_search_chunks(user_id: str, rows: list) -> None:
    if not rows:
        return
    payload = [_encrypt_fields("search_chunk", {"user_id": user_id, **r}) for r in rows]
    for start in range(0, len(payload), 200):
        get_client().table("search_chunk").upsert(
            payload[start:start + 200], on_conflict="user_id,kind,entity_id").execute()


def delete_search_chunks(user_id: str, kind: str, entity_ids: list) -> None:
    if entity_ids:
        get_client().table("search_chunk").delete().eq("user_id", user_id).eq("kind", kind) \
            .in_("entity_id", list(entity_ids)).execute()


def get_search_chunk_keys(user_id: str) -> list:
    return get_client().table("search_chunk").select("kind, entity_id").eq("user_id", user_id).execute().data


def get_search_chunks(user_id: str, kinds=None, initiative_id=None,
                      date_from=None, date_to=None) -> list:
    """All chunks matching the filters, decrypted, WITHOUT embeddings -
    the keyword (BM25) side of hybrid search scores these in Python."""
    q = (get_client().table("search_chunk")
         .select("id, kind, entity_id, title, text, item_date, person_ids, initiative_id, meta")
         .eq("user_id", user_id))
    if kinds:
        q = q.in_("kind", list(kinds))
    if initiative_id is not None:
        q = q.eq("initiative_id", initiative_id)
    if date_from:
        q = q.gte("item_date", date_from)
    if date_to:
        q = q.lte("item_date", date_to)
    return _decrypt_rows("search_chunk", q.execute().data)


def match_search_chunks(user_id: str, query_embedding, k: int = 40, kinds=None,
                        initiative_id=None, date_from=None, date_to=None) -> list:
    return get_client().rpc("match_search_chunks", {
        "query_embedding": query_embedding, "filter_user_id": user_id, "match_count": k,
        "filter_kinds": list(kinds) if kinds else None, "filter_person_id": None,
        "filter_initiative_id": initiative_id, "date_from": date_from, "date_to": date_to,
    }).execute().data


# ---------- Daily brief cache (schema.sql section 30) ----------

def get_daily_brief(user_id: str, brief_date: str):
    """The stored brief for this user and day, or None."""
    rows = (
        get_client().table("daily_brief").select("*")
        .eq("user_id", user_id).eq("brief_date", brief_date).limit(1).execute().data
    )
    return _decrypt_row("daily_brief", rows[0]) if rows else None


def save_daily_brief(user_id: str, brief_date: str, fingerprint: str, brief: str, written_at: str = None) -> None:
    """One row per user per day - a re-written brief replaces the old one."""
    row = {"user_id": user_id, "brief_date": brief_date, "fingerprint": fingerprint, "brief": brief}
    if written_at:
        row["created_at"] = written_at  # the column default only applies on insert, not on a rewrite
    get_client().table("daily_brief").upsert(
        _encrypt_fields("daily_brief", row),
        on_conflict="user_id,brief_date",
    ).execute()


if __name__ == "__main__":
    # Quick connectivity check: confirms env vars are set and the tables
    # from schema.sql exist.
    client = get_client()
    resp = client.table("interaction").select("id").limit(1).execute()
    print("Connected to Supabase successfully. `interaction` table is reachable.")
