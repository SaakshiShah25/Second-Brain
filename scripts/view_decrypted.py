"""
scripts/view_decrypted.py — QA helper: prints database rows with every
encrypted field transparently decrypted, for manually verifying stored
content during testing (see the QA playbook).

Reuses db.py's own read functions (which already decrypt every field on
the way out - see crypto_utils.py) rather than re-implementing
decryption, so what this prints is guaranteed to match exactly what the
app itself reads - never a separate, possibly-inconsistent code path.

This is NOT a way to disable or bypass encryption. The database itself
still only ever stores ciphertext - confirm THAT directly in Supabase's
own table editor (that's the correct place to check it, and seeing
unreadable text there is the expected, correct result, not a bug). This
script just decrypts for display, locally, in your own terminal, the
same way the app already does on every page load - it needs the same
ENCRYPTION_KEY and SUPABASE_KEY your local .env already has.

This reads real account data. Treat the output the same way you'd treat
any other decrypted view of it - don't paste it somewhere public.

Usage:
    python scripts/view_decrypted.py people        --user-id <uuid>
    python scripts/view_decrypted.py interactions  --user-id <uuid>
    python scripts/view_decrypted.py tasks         --user-id <uuid>
    python scripts/view_decrypted.py person        --user-id <uuid> --id 7
    python scripts/view_decrypted.py interaction   --user-id <uuid> --id 42
    python scripts/view_decrypted.py task          --user-id <uuid> --id 3

Find your user_id in the Supabase dashboard: Authentication -> Users ->
copy the UUID next to your account's email.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

import db  # noqa: E402


def _strip_embedding(row):
    """The 1024-dim embedding vector is pure noise for a human reading
    this in a terminal - replaced with a short placeholder unless
    --full-embedding is passed."""
    if isinstance(row, list):
        return [_strip_embedding(r) for r in row]
    if isinstance(row, dict) and "embedding" in row and row["embedding"] is not None:
        row = dict(row)
        row["embedding"] = "[embedding vector omitted - pass --full-embedding to see it]"
    return row


def _print_rows(rows, full_embedding: bool) -> None:
    if not full_embedding:
        rows = _strip_embedding(rows)
    print(json.dumps(rows, indent=2, default=str))


def main() -> None:
    parser = argparse.ArgumentParser(description="Print decrypted DB rows for QA/testing.")
    parser.add_argument(
        "resource",
        choices=["people", "person", "interactions", "interaction", "tasks", "task"],
    )
    parser.add_argument("--user-id", required=True, help="Your account's user_id (see docstring above)")
    parser.add_argument("--id", type=int, help="Fetch a single row by id, instead of every row")
    parser.add_argument(
        "--full-embedding", action="store_true", help="Include the full 1024-dim embedding vector (omitted by default)"
    )
    args = parser.parse_args()

    if args.resource in ("people", "person"):
        rows = db.get_person(args.user_id, args.id) if args.id else db.get_all_people(args.user_id)
    elif args.resource in ("interactions", "interaction"):
        rows = (
            db.get_interactions_by_ids(args.user_id, [args.id])
            if args.id
            else db.get_all_interactions_with_context(args.user_id)
        )
    else:
        rows = db.get_task(args.user_id, args.id) if args.id else db.get_all_tasks_with_context(args.user_id)

    _print_rows(rows, args.full_embedding)


if __name__ == "__main__":
    main()
