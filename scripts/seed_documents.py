"""
scripts/seed_documents.py — Loads the sample documents from
scripts/demo_documents.py into the three persona test accounts:

    work@myconfia.local      13 work documents (contracts, decks, invoices, HR, company)
    personal@myconfia.local  18 personal documents (IDs, finance, home, health, family)
    both@myconfia.local      16 - a mix of both

    .venv/bin/python scripts/seed_documents.py

Needs the `document` table (schema.sql section 26). Re-runnable: each run
deletes these accounts' existing documents (rows + stored files) first.
Metadata is supplied up front (no Gemini call per file) so the seed is
fast and deterministic - upload a file through the app to see the AI
filing in action.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from seed_demo_data import find_user_id  # noqa: E402  (also loads .env)
import db  # noqa: E402
import demo_documents  # noqa: E402
import documents  # noqa: E402

ACCOUNTS = {
    "work@myconfia.local": "work",
    "personal@myconfia.local": "personal",
    "both@myconfia.local": "both",
}


def wipe_documents(uid: str) -> None:
    rows = db.get_client().table("document").select("id, storage_path, thumb_path").eq("user_id", uid).execute().data
    documents.remove_objects([p for r in rows for p in (r["storage_path"], r["thumb_path"])])
    db.get_client().table("document").delete().eq("user_id", uid).execute()


def main():
    try:
        db.get_client().table("document").select("id").limit(1).execute()
    except Exception:
        raise SystemExit("The `document` table doesn't exist yet - run schema.sql section 26 in Supabase first.")
    documents.ensure_bucket()
    for email, persona in ACCOUNTS.items():
        uid = find_user_id(email)
        wipe_documents(uid)
        docs = demo_documents.SETS[persona]()
        for doc in docs:
            documents.create_from_bytes(uid, doc["data"], doc["mime_type"], doc["file_name"],
                                        overrides=doc["meta"], thumbnail=doc["thumbnail"])
        print(f"{email}: {len(docs)} documents")


if __name__ == "__main__":
    main()
