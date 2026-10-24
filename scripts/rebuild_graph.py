"""
scripts/rebuild_graph.py — Derives the knowledge graph and facts
(organization, entity_edge, fact - schema.sql section 29) from existing
people, notes and documents, then refreshes the search index so company
cards are searchable. No LLM calls. Idempotent: safe to re-run.

    .venv/bin/python scripts/rebuild_graph.py              # every account
    .venv/bin/python scripts/rebuild_graph.py a@b.com ...   # just these
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from reindex_search import all_user_ids  # noqa: E402
from seed_demo_data import find_user_id  # noqa: E402
import graph  # noqa: E402
import search_index  # noqa: E402


def main():
    targets = [(find_user_id(e), e) for e in sys.argv[1:]] if len(sys.argv) > 1 else all_user_ids()
    for uid, email in targets:
        stats = graph.rebuild_user(uid)
        chunks = search_index.reindex_user(uid)
        print(f"{email}: {stats} · {chunks} search chunks")


if __name__ == "__main__":
    main()
