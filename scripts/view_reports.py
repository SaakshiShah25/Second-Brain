"""
scripts/view_reports.py - the maintainer's view of "Report" submissions.

Users flag an AI answer (or a saved-note summary) with the Report button;
each report is one row in the `ai_report` table. The question, the AI's
answer and the user's details are encrypted there (they quote private
notes), so the Supabase table editor only shows ciphertext for those
columns. This script reads the table through db.py, which decrypts, and
prints a summary plus the individual reports. There is deliberately no
in-app screen or API for this - reports contain users' private text and
only the person holding the service-role and encryption keys should see it.

Needs the same .env as the backend (SUPABASE_URL, SUPABASE_KEY,
ENCRYPTION_KEY), and schema.sql section 26 applied.

Usage (from the repo root):
    python scripts/view_reports.py                    # summary + open reports
    python scripts/view_reports.py --status all       # include reviewed ones
    python scripts/view_reports.py --reason offensive # filter by reason
    python scripts/view_reports.py --limit 10
    python scripts/view_reports.py --mark-reviewed 7  # close report #7

This prints real user content - don't paste the output anywhere public.
"""

import argparse
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import db  # noqa: E402


def _indent(text, prefix="    "):
    return "\n".join(prefix + line for line in (text or "-").splitlines())


def main():
    p = argparse.ArgumentParser(description="Review user reports of AI answers.")
    p.add_argument("--status", default="open", choices=["open", "reviewed", "all"])
    p.add_argument("--reason", choices=["incorrect", "offensive", "irrelevant", "other"])
    p.add_argument("--limit", type=int, default=50)
    p.add_argument("--mark-reviewed", type=int, metavar="ID")
    args = p.parse_args()

    if args.mark_reviewed:
        db.mark_report_reviewed(args.mark_reviewed)
        print(f"Report #{args.mark_reviewed} marked as reviewed.")
        return

    try:
        rows = db.list_reports(limit=args.limit, status=None if args.status == "all" else args.status)
    except Exception as e:  # most likely: the ai_report table doesn't exist yet
        print(f"Couldn't read reports: {e}\nHave you run schema.sql section 26 in the Supabase SQL editor?")
        sys.exit(1)

    if args.reason:
        rows = [r for r in rows if r["reason"] == args.reason]
    if not rows:
        print("No reports match.")
        return

    print(f"{len(rows)} report(s)  |  by reason: {dict(Counter(r['reason'] for r in rows))}"
          f"  |  by kind: {dict(Counter(r['kind'] for r in rows))}\n")
    for r in rows:
        print(f"#{r['id']}  {r['created_at'][:16].replace('T', ' ')}  [{r['status']}]  "
              f"reason={r['reason']}  kind={r['kind']}  user={r['user_id'][:8]}…")
        print("  Asked / logged:")
        print(_indent(r.get("question")))
        print("  AI replied:")
        print(_indent(r.get("answer")))
        if r.get("details"):
            print("  User's details:")
            print(_indent(r["details"]))
        ids = r.get("source_interaction_ids") or []
        if ids:
            print(f"  Source note ids: {ids}")
        print()


if __name__ == "__main__":
    main()
