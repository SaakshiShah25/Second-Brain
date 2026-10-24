"""
scripts/apply_migration.py — Applies scripts/pending_migration.sql to the
Supabase Postgres database, then asks PostgREST to reload its schema cache
(without that, the API keeps answering "table not found" for new tables).

    .venv/bin/python scripts/apply_migration.py [path/to/file.sql]

Needs DATABASE_URL in .env: Supabase > Project Settings > Database >
Connection string > URI (session pooler). Dev-only dependency:
    .venv/bin/pip install "psycopg[binary]"
The whole file runs in one transaction - it either all applies or nothing does.
"""

import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import psycopg  # noqa: E402


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL isn't set in .env - see this script's docstring.")
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "pending_migration.sql")
    sql = open(path).read()
    with psycopg.connect(url, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            cur.execute("notify pgrst, 'reload schema'")
        conn.commit()
    print(f"Applied {os.path.basename(path)} and reloaded the API schema cache.")


if __name__ == "__main__":
    main()
