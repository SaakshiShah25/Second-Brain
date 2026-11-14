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

from postgrest.exceptions import APIError
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


def reset_client() -> None:
    """Forgets this thread's Supabase client so the next get_client() opens a fresh connection - for
    when the old one went stale (an idle connection dropped while the free server slept)."""
    _local.client = None


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
# db.py (retrieval.py, extraction.py, every
# api/routers/*.py) keeps seeing plain Python strings, unchanged.
#
# Deliberately NOT encrypted: initiative.name - it is used for real
# server-side matching; encrypting it would break that matching, and it
# is materially less sensitive than the actual note content.

_ENCRYPTED_TEXT_FIELDS = {
    "interaction": ["raw_text", "summary", "location", "appearance", "geo_address"],
    "task": ["description", "detail"],
    "search_chunk": ["title", "text"],
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
                        decisions=None, concerns=None, initiative_id=None, source_id=None):
    row = {
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
    }
    if source_id is not None:
        # One message that touched several initiatives is saved as one note per initiative; the first holds the
        # original text and the others point at it (and are deleted with it) instead of repeating it.
        row["source_id"] = source_id
    resp = get_client().table("interaction").insert(_encrypt_fields("interaction", row)).execute()
    return resp.data[0]["id"]


_source_links_ok = False


def source_links_supported() -> bool:
    """True once the `interaction.source_id` column exists (scripts/migration_37_source_note.sql). Until the SQL has
    been run, a message about several initiatives keeps the original text on every note, as before. Only a yes is
    remembered, so running the SQL takes effect without a restart."""
    global _source_links_ok
    if _source_links_ok:
        return True
    try:
        get_client().table("interaction").select("source_id").limit(1).execute()
    except Exception:
        return False
    _source_links_ok = True
    return True


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

_task_extras_ok = False


def task_extras_supported() -> bool:
    """True once the task options columns exist (scripts/migration_38_task_options.sql): priority, remind_on,
    reminded_on and the task's own initiative_id. Only a yes is remembered, so running the SQL takes effect
    without a restart."""
    global _task_extras_ok
    if _task_extras_ok:
        return True
    try:
        get_client().table("task").select("priority, remind_on, reminded_on, initiative_id").limit(1).execute()
    except Exception:
        return False
    _task_extras_ok = True
    return True


_remind_time_ok = False


def reminder_time_supported() -> bool:
    """True once task.remind_time exists (scripts/migration_41_reminder_time.sql). Only a yes is remembered."""
    global _remind_time_ok
    if _remind_time_ok:
        return True
    try:
        get_client().table("task").select("remind_time").limit(1).execute()
    except Exception:
        return False
    _remind_time_ok = True
    return True


def create_task(user_id: str, interaction_id, description, due_date=None, owner="me", due_time=None, initiative_id=None,
                list_id=None, repeat=None, detail=None):
    """One item. `interaction_id` is the note it came from, or None for an item captured on its own
    ("add Dune to my reading list"); `list_id` None means the main Tasks list."""
    row = {
        "user_id": user_id,
        "interaction_id": interaction_id,
        "description": description,
        "due_date": due_date,
        "owner": owner,          # 'me' or 'them' - see extraction.py's follow_ups[].owner
    }
    if due_time:  # only sent when there is one: the column exists once schema.sql section 32 has run
        row["due_time"] = due_time
    if task_extras_supported():
        row["initiative_id"] = initiative_id  # the task's own category: starts as its note's, can be moved later
    # Only sent when set, so a plain to-do still saves on a database without the lists columns (schema.sql section 40).
    for key, value in (("list_id", list_id), ("repeat", repeat), ("detail", detail)):
        if value:
            row[key] = value
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
    Fetches every item joined with its note's date/summary/initiative and its
    list - the Today, Lists and Tasks pages all read from this one call.
    Optional `status` filter ('open'/'done'); None returns all statuses.
    Ordered by due_date (nulls last).
    """
    query = (
        get_client().table("task")
        .select("*, interaction(id, date, summary, initiative(id, name)), item_list(id, name, emoji)")
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


def set_tasks_initiative(user_id: str, interaction_id: int, initiative_id) -> None:
    """A note moved to another category: the tasks it created follow it. No-op until the task options SQL has run."""
    if not task_extras_supported():
        return
    get_client().table("task").update({"initiative_id": initiative_id}).eq("interaction_id", interaction_id).eq("user_id", user_id).execute()


def get_tasks_to_remind(user_id: str, today: str, since: str) -> list:
    """Open tasks whose reminder date is `since`..`today` (a short grace period so a missed run still delivers)
    and that haven't been reminded yet."""
    if not task_extras_supported():
        return []
    resp = (
        get_client().table("task").select("*")
        .eq("user_id", user_id).eq("status", "open")
        .gte("remind_on", since).lte("remind_on", today)
        .is_("reminded_on", "null")
        .execute()
    )
    return _decrypt_rows("task", resp.data)


def mark_tasks_reminded(task_ids: list, on_date: str) -> None:
    if task_ids:
        get_client().table("task").update({"reminded_on": on_date}).in_("id", task_ids).execute()


def get_users_with_reminders(today: str, since: str) -> set:
    """Users who have at least one open task with a reminder due (so the scheduler only builds messages for them)."""
    if not task_extras_supported():
        return set()
    resp = (
        get_client().table("task").select("user_id")
        .eq("status", "open").gte("remind_on", since).lte("remind_on", today).is_("reminded_on", "null")
        .execute()
    )
    return {r["user_id"] for r in resp.data}


def update_task_owner(user_id: str, task_id: int, owner: str):
    get_client().table("task").update({"owner": owner}).eq("id", task_id).eq("user_id", user_id).execute()


def get_task(user_id: str, task_id: int):
    """Single task by id (None-safe via .single() raising if absent)."""
    resp = get_client().table("task").select("*").eq("id", task_id).eq("user_id", user_id).single().execute()
    return _decrypt_row("task", resp.data)


def delete_task(user_id: str, task_id: int):
    get_client().table("task").delete().eq("id", task_id).eq("user_id", user_id).execute()


_remind_before_ok = False


def remind_before_supported() -> bool:
    """True once task.remind_before exists (scripts/migration_45_remind_before.sql). Only a yes is remembered."""
    global _remind_before_ok
    if _remind_before_ok:
        return True
    try:
        get_client().table("task").select("remind_before").limit(1).execute()
    except Exception:
        return False
    _remind_before_ok = True
    return True


def get_reminder_candidates(user_ids: list, until_date: str) -> list:
    """Open items that can raise their own push reminder - ones with a time of day or a repeat -
    due on or before `until_date`, for these users. Read by push_notify.send_due every minute."""
    if not user_ids:
        return []
    # remind_on (the bell) only exists once the task options SQL has run; an item with a bell set is reminded by that.
    columns = "id, user_id, description, due_date, due_time, repeat, reminded_key, item_list(name, emoji)"
    if task_extras_supported():
        columns += ", remind_on"
    early = remind_before_supported()
    if early:
        columns += ", remind_before"
    resp = (
        get_client().table("task")
        .select(columns)
        .in_("user_id", list(user_ids)).eq("status", "open")
        .not_.is_("due_date", "null").lte("due_date", until_date)
        .or_("due_time.not.is.null,repeat.not.is.null" + (",remind_before.not.is.null" if early else ""))
        .execute()
    )
    return _decrypt_rows("task", resp.data)


def mark_task_reminded(task_id: int, key: str):
    get_client().table("task").update({"reminded_key": key}).eq("id", task_id).execute()


# ---------- Lists (schema.sql section 40) ----------

_UNIQUE_VIOLATION = "23505"


def get_lists(user_id: str) -> list:
    return (get_client().table("item_list").select("*").eq("user_id", user_id)
            .order("position", nullsfirst=False).order("created_at").execute().data)


def get_list(user_id: str, list_id: int):
    rows = get_client().table("item_list").select("*").eq("id", list_id).eq("user_id", user_id).execute().data
    return rows[0] if rows else None


def get_list_by_name(user_id: str, name: str, initiative_id=None, any_space: bool = True):
    """Case-insensitive exact match (ilike with no wildcards), like get_initiative_by_name. A list belongs to one
    space, so with `any_space=False` only the list in `initiative_id` (None = the ones with no space) counts."""
    escaped = name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    rows = get_client().table("item_list").select("*").eq("user_id", user_id).ilike("name", escaped).execute().data
    if not any_space and list_space_supported():
        rows = [r for r in rows if (r.get("initiative_id") or None) == (initiative_id or None)]
    return rows[0] if rows else None


def find_list(user_id: str, name: str, initiative_id=None, lists=None):
    """The user's list that means the same as `name` ("Films" finds "Movies") in this space (None = no space).
    Before migration 43 lists have no space, so the name alone decides."""
    import text_utils
    key = text_utils.list_key(name)
    supported = list_space_supported()
    for l in (get_lists(user_id) if lists is None else lists):
        if text_utils.list_key(l["name"]) == key and (not supported or (l.get("initiative_id") or None) == (initiative_id or None)):
            return l
    return None


def set_list_tasks_space(user_id: str, list_id: int, initiative_id) -> None:
    """Every entry of a list takes the list's space (an entry lives where its list lives)."""
    if task_extras_supported():
        get_client().table("task").update({"initiative_id": initiative_id}).eq("list_id", list_id).eq("user_id", user_id).execute()


_list_space_ok = False


def list_space_supported() -> bool:
    """True once item_list.initiative_id exists (scripts/migration_43_list_space.sql). Only a yes is remembered."""
    global _list_space_ok
    if _list_space_ok:
        return True
    try:
        get_client().table("item_list").select("initiative_id").limit(1).execute()
    except Exception:
        return False
    _list_space_ok = True
    return True


def create_list(user_id: str, name: str, emoji: str = None, initiative_id: int = None) -> dict:
    """Returns the existing list instead when one with this name is already there - two captures
    a moment apart can both decide a "Movies" list is needed. `initiative_id` is the space it lives in
    (kept only once migration 43 has run)."""
    row = {"user_id": user_id, "name": name, "emoji": emoji}
    if initiative_id is not None and list_space_supported():
        row["initiative_id"] = initiative_id
    try:
        resp = get_client().table("item_list").insert(row).execute()
        return resp.data[0]
    except APIError as e:
        if e.code != _UNIQUE_VIOLATION:
            raise
        # The same name in the same space; before migration 44 the name alone is unique, so fall back to that.
        return get_list_by_name(user_id, name, initiative_id, any_space=False) or get_list_by_name(user_id, name)


def get_list_initiative(user_id: str, list_id: int):
    """The space a list lives in: the one it was given ("create a reading list in Personal"), else the space most
    of its items are in (None when neither), so a new entry added without saying where it belongs
    ("add Sapiens to my reading list") goes next to the others."""
    home = (get_list(user_id, list_id) or {}).get("initiative_id")
    if home:
        return home
    try:
        rows = (get_client().table("task").select("initiative_id").eq("user_id", user_id).eq("list_id", list_id)
                .not_.is_("initiative_id", "null").limit(50).execute().data)
    except Exception:
        return None
    counts: dict = {}
    for r in rows:
        counts[r["initiative_id"]] = counts.get(r["initiative_id"], 0) + 1
    return max(counts, key=counts.get) if counts else None


def update_list(user_id: str, list_id: int, **fields):
    if fields:
        get_client().table("item_list").update(fields).eq("id", list_id).eq("user_id", user_id).execute()
    return get_list(user_id, list_id)


def delete_list(user_id: str, list_id: int):
    """Its items go with it (task.list_id is ON DELETE CASCADE)."""
    get_client().table("item_list").delete().eq("id", list_id).eq("user_id", user_id).execute()


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
    _announce_signup(user_id)
    return resp.data[0]


def _announce_signup(user_id: str) -> None:
    """A settings row is created exactly once per account, the first time the app loads for it - so this is the
    moment of a new signup. Emails ALERT_EMAIL ("[MyConfía] New signup: ..."), in the background, never failing
    the request. Does nothing when ALERT_EMAIL isn't set."""
    def run():
        try:
            import observability

            if not observability.alert_email():
                return
            email = get_user_email(user_id) or "(no email on the account)"
            when = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
            observability.alert(
                f"signup:{user_id}",
                f"New signup: {email}",
                f"{email} just signed up and opened MyConfía.\n\nWhen: {when}\nUser id: {user_id}\n\n"
                "If they should not have access, remove them from ALLOWED_EMAILS on Render.",
            )
        except Exception as e:  # noqa: BLE001 - an announcement must never break a sign-in
            print(f"[warn] signup alert failed: {e}")

    threading.Thread(target=run, daemon=True, name="signup-alert").start()


def update_user_preference(user_id: str, **fields) -> dict:
    """Upserts so this works whether or not get_user_preference() has
    already created the row for this user."""
    row = {"user_id": user_id, "updated_at": datetime.now(timezone.utc).isoformat(), **fields}
    resp = get_client().table("user_preference").upsert(row).execute()
    return resp.data[0]


def get_mcp_revoked_at(user_id: str) -> int:
    """Unix time of the person's last "Disconnect Claude" (0 = never, or before migration 48 has run)."""
    try:
        rows = get_client().table("user_preference").select("mcp_revoked_at").eq("user_id", user_id).execute().data
    except Exception:  # noqa: BLE001 - the column isn't there yet
        return 0
    value = rows[0].get("mcp_revoked_at") if rows else None
    if not value:
        return 0
    return int(datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp())


def revoke_mcp(user_id: str) -> None:
    """Cuts every Claude connection of this person off, now. Raises if migration 48 hasn't run."""
    get_user_preference(user_id)  # make sure the row exists
    get_client().table("user_preference").update({"mcp_revoked_at": datetime.now(timezone.utc).isoformat()}).eq("user_id", user_id).execute()


def get_user_email(user_id: str) -> str:
    """Looks up the account's login email via the Auth admin API (not
    stored redundantly in `user_preference`) - used by
    the admin alerts and the daily report to know where to send them."""
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


# ---------- Initiatives (user-managed note categories - schema.sql section 20) ----------

DEFAULT_INITIATIVES = ["Personal", "Work"]


def get_initiatives(user_id: str) -> list:
    """Every initiative for this user, seeding the 2 starter initiatives
    on first read if none exist yet - same create-default-on-first-read
    shape as get_user_preference(), so this works for the existing
    account and any future signup with no separate seed step needed."""
    query = lambda: get_client().table("initiative").select("*").eq("user_id", user_id)
    try:
        resp = query().order("position", nullsfirst=False).order("created_at").execute()
    except Exception:
        resp = query().order("created_at").execute()  # no `position` column until schema.sql section 34
    if resp.data:
        return resp.data
    rows = [{"user_id": user_id, "name": name} for name in DEFAULT_INITIATIVES]
    resp = get_client().table("initiative").insert(rows).execute()
    return resp.data


def reorder_initiatives(user_id: str, ids: list) -> bool:
    """Saves the user's order (ids first to last). False when the
    `position` column isn't there yet (schema.sql section 34)."""
    try:
        for position, initiative_id in enumerate(ids):
            (get_client().table("initiative").update({"position": position})
             .eq("id", initiative_id).eq("user_id", user_id).execute())
    except Exception as e:
        print(f"[warn] couldn't save initiative order (run schema.sql section 34?): {e}")
        return False
    return True


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


# ---------- Web Push subscriptions (schema.sql section 36, push_notify.py) ----------

MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10


def upsert_push_subscription(user_id: str, endpoint: str, p256dh: str, auth: str, timezone_name: str) -> None:
    """One row per device endpoint. Re-subscribing from the same device updates its keys and
    time zone (and re-assigns it if the browser is now signed in as someone else)."""
    now = datetime.now(timezone.utc).isoformat()
    get_client().table("push_subscription").upsert(
        {"user_id": user_id, "endpoint": endpoint, "p256dh": p256dh, "auth": auth,
         "timezone": timezone_name, "updated_at": now},
        on_conflict="endpoint",
    ).execute()
    # Keep the newest few devices per user - an old phone that was replaced shouldn't pile up.
    rows = (get_client().table("push_subscription").select("id")
            .eq("user_id", user_id).order("updated_at", desc=True).execute().data)
    stale = [r["id"] for r in rows[MAX_PUSH_SUBSCRIPTIONS_PER_USER:]]
    if stale:
        get_client().table("push_subscription").delete().in_("id", stale).execute()


def delete_push_subscription(endpoint: str, user_id: Optional[str] = None) -> None:
    q = get_client().table("push_subscription").delete().eq("endpoint", endpoint)
    if user_id:
        q = q.eq("user_id", user_id)
    q.execute()


def get_push_subscriptions(user_id: Optional[str] = None) -> list:
    q = get_client().table("push_subscription").select("*")
    if user_id:
        q = q.eq("user_id", user_id)
    return q.execute().data


PUSH_PREF_COLUMNS = ("morning_on", "morning_time", "evening_on", "evening_time", "alarm_style")


def push_prefs_supported() -> bool:
    """True once push_subscription has the preference columns (scripts/migration_46_reminder_prefs.sql)."""
    try:
        get_client().table("push_subscription").select(",".join(PUSH_PREF_COLUMNS)).limit(1).execute()
    except Exception:
        return False
    return True


def get_push_prefs(user_id: str, endpoint: str) -> Optional[dict]:
    """This device's summary times and alarm choice (the defaults when the migration hasn't run), or None when the
    device isn't subscribed."""
    rows = (get_client().table("push_subscription").select("*")
            .eq("user_id", user_id).eq("endpoint", endpoint).execute().data)
    if not rows:
        return None
    row = rows[0]
    defaults = {"morning_on": True, "morning_time": "09:00", "evening_on": True, "evening_time": "17:00", "alarm_style": False}
    return {k: row.get(k, defaults[k]) for k in PUSH_PREF_COLUMNS}


def set_push_prefs(user_id: str, endpoint: str, fields: dict) -> None:
    (get_client().table("push_subscription").update(
        {**fields, "updated_at": datetime.now(timezone.utc).isoformat()})
     .eq("user_id", user_id).eq("endpoint", endpoint).execute())


def mark_push_sent(subscription_id: int, slot: str, local_date: str) -> None:
    """slot is '9am' or '5pm'."""
    get_client().table("push_subscription").update({f"last_{slot}": local_date}).eq("id", subscription_id).execute()


# ---------- Observability events (schema.sql section 35, observability.py) ----------

def insert_app_events(rows: list) -> None:
    for start in range(0, len(rows), 500):
        get_client().table("app_event").insert(rows[start:start + 500]).execute()


def get_app_events(since_iso: str) -> list:
    """Every event since `since_iso`, oldest first, paged past PostgREST's
    1,000-row default cap."""
    out, start = [], 0
    while True:
        page = (
            get_client().table("app_event").select("*")
            .gte("created_at", since_iso).order("created_at").range(start, start + 999).execute().data
        )
        out += page
        if len(page) < 1000:
            return out
        start += 1000


def delete_app_events_before(before_iso: str) -> None:
    get_client().table("app_event").delete().lt("created_at", before_iso).execute()


def get_all_user_emails() -> dict:
    """{user_id: email} for every account - the admin page labels usage with it."""
    users, page = {}, 1
    while True:
        batch = get_client().auth.admin.list_users(page=page, per_page=1000)
        for u in batch:
            users[u.id] = u.email
        if len(batch) < 1000:
            return users
        page += 1


def get_all_users() -> dict:
    """{user_id: {"email", "created_at", "last_sign_in_at"}} for every account - the admin page's
    "who isn't using it" list."""
    users, page = {}, 1
    while True:
        batch = get_client().auth.admin.list_users(page=page, per_page=1000)
        for u in batch:
            users[u.id] = {"email": u.email, "created_at": str(u.created_at or ""),
                           "last_sign_in_at": str(u.last_sign_in_at or "") or None}
        if len(batch) < 1000:
            return users
        page += 1


def get_storage_by_user() -> list:
    """Per-user row counts and byte sizes (migration 43). Counts/sizes only, never content."""
    return get_client().rpc("admin_storage_by_user").execute().data or []


if __name__ == "__main__":
    # Quick connectivity check: confirms env vars are set and the tables
    # from schema.sql exist.
    client = get_client()
    resp = client.table("interaction").select("id").limit(1).execute()
    print("Connected to Supabase successfully. `interaction` table is reachable.")


# ---------- Feedback (schema.sql section 47) ----------

def insert_feedback(row: dict) -> dict:
    return get_client().table("feedback").insert(row).execute().data[0]


def count_feedback_since(user_id: str, since_iso: str, kinds: list) -> int:
    resp = (get_client().table("feedback").select("id", count="exact").eq("user_id", user_id)
            .in_("kind", kinds).gte("created_at", since_iso).limit(1).execute())
    return resp.count or 0


def get_last_feedback(user_id: str, kinds: list):
    """The newest feedback row of these kinds for this person, or None."""
    rows = (get_client().table("feedback").select("kind, created_at, context").eq("user_id", user_id)
            .in_("kind", kinds).order("created_at", desc=True).limit(1).execute().data)
    return rows[0] if rows else None


def count_interactions(user_id: str) -> int:
    resp = get_client().table("interaction").select("id", count="exact").eq("user_id", user_id).limit(1).execute()
    return resp.count or 0


def get_feedback(since_iso: str) -> list:
    """Every rating and reported problem since `since_iso`, newest first (snoozes are bookkeeping, not feedback)."""
    return (get_client().table("feedback").select("*").neq("kind", "snooze")
            .gte("created_at", since_iso).order("created_at", desc=True).limit(1000).execute().data)


def update_feedback_status(feedback_id: int, status: str) -> None:
    get_client().table("feedback").update({"status": status}).eq("id", feedback_id).execute()

