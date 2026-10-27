"""
scripts/reindex_search.py — (Re)builds the unified search index
(search_chunk, schema.sql section 28) from the source tables.

    .venv/bin/python scripts/reindex_search.py              # every account
    .venv/bin/python scripts/reindex_search.py a@b.com ...   # just these

Safe any time - chunks are derived data. Needed once after applying
section 28 (to index everything that existed before), and as a repair
tool if background indexing ever missed something.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from seed_demo_data import find_user_id  # noqa: E402  (also loads .env)
import db  # noqa: E402
import search_index  # noqa: E402


def all_user_ids() -> list:
    ids, page = [], 1
    while True:
        users = db.get_client().auth.admin.list_users(page=page, per_page=200)
        if not users:
            return ids
        ids += [(u.id, u.email) for u in users]
        page += 1


def main():
    targets = [(find_user_id(e), e) for e in sys.argv[1:]] if len(sys.argv) > 1 else all_user_ids()
    for uid, email in targets:
        print(f"{email}: {search_index.reindex_user(uid)} chunks")


if __name__ == "__main__":
    main()
