"""
scripts/encrypt_existing_data.py — one-off backfill: encrypts existing
plaintext person/interaction/task/google_credentials rows in place, for
any database that had data before ENCRYPTION_KEY / encrypt-at-rest
shipped (see crypto_utils.py + db.py's _encrypt_fields()/_decrypt_row()).
New rows are already encrypted automatically from the first capture -
this script exists only to catch up rows written before this feature
existed.

Safe to re-run: db.py's read functions decrypt via crypto_utils.decrypt()'s
InvalidToken fallback, which passes an already-plaintext value through
unchanged - so every read here always comes back as clean plaintext
regardless of whether a given row was migrated yet, and re-running this
script just re-encrypts to a new ciphertext token (not double-encryption,
since the read step always normalizes back to plaintext first).

Run once, in order:
  1. Apply schema.sql section 22 in the Supabase SQL Editor (jsonb -> text
     columns, so there's somewhere for a ciphertext blob to live).
  2. Set ENCRYPTION_KEY (see README.md's "Encrypt-at-rest setup").
  3. python scripts/encrypt_existing_data.py

A brand-new project with no pre-existing data has nothing to migrate -
skip this script entirely.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

import db  # noqa: E402


def _all_user_ids() -> list:
    # No cross-user db.py helper exists (everything is deliberately
    # user_id-scoped) - this is the one place in this script that reaches
    # past db.py's normal API to just list every user_id with any data.
    client = db.get_client()
    ids = set()
    for table in ("person", "interaction", "task", "google_credentials"):
        resp = client.table(table).select("user_id").execute()
        ids.update(row["user_id"] for row in resp.data)
    return list(ids)


def migrate_people(user_id: str) -> int:
    people = db.get_all_people(user_id)  # already decrypted-or-passthrough
    for p in people:
        db.update_person(
            user_id, p["id"],
            description=p.get("description") or "",
            personal_notes=p.get("personal_notes") or [],
        )
    return len(people)


def migrate_interactions(user_id: str) -> int:
    interactions = db.get_all_interactions(user_id)
    for i in interactions:
        db.update_interaction(
            user_id, i["id"],
            raw_text=i.get("raw_text") or "",
            summary=i.get("summary") or "",
            location=i.get("location"),
            appearance=i.get("appearance") or "",
            geo_address=i.get("geo_address"),
            sentiment=i.get("sentiment") or [],
            topics=i.get("topics") or [],
            extracted_facts=i.get("extracted_facts") or {},
            decisions=i.get("decisions") or [],
            concerns=i.get("concerns") or [],
        )
    return len(interactions)


def migrate_tasks(user_id: str) -> int:
    # No generic task-field updater exists in db.py (only status/owner/
    # calendar_event_id, none of them the content field) - going through
    # the client directly here, one-off-script only, not a new permanent
    # db.py code path.
    tasks = db.get_all_tasks_with_context(user_id)
    client = db.get_client()
    for t in tasks:
        client.table("task").update(
            db._encrypt_fields("task", {"description": t.get("description") or ""})
        ).eq("id", t["id"]).eq("user_id", user_id).execute()
    return len(tasks)


def migrate_google_credentials(user_id: str) -> int:
    creds = db.get_google_credentials(user_id)
    if not creds:
        return 0
    db.upsert_google_credentials(
        user_id,
        access_token=creds["access_token"],
        refresh_token=creds["refresh_token"],
        expires_at=creds["expires_at"],
        scope=creds.get("scope") or "",
    )
    return 1


if __name__ == "__main__":
    user_ids = _all_user_ids()
    print(f"Found {len(user_ids)} user(s) with data.")
    for uid in user_ids:
        print(f"Migrating user {uid}...")
        print(f"  people: {migrate_people(uid)}")
        print(f"  interactions: {migrate_interactions(uid)}")
        print(f"  tasks: {migrate_tasks(uid)}")
        print(f"  google_credentials: {migrate_google_credentials(uid)}")
    print("Done.")
