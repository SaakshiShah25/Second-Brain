"""
scripts/reextract_memory.py - Files the details, dates and family links from
notes that were saved but never had them filed (or were saved before the
extraction kept its memory payload). Re-reads each note's original text with
the model (one call per note), keeps the result with the note, and files it.
Safe to repeat: anything already filed is recognised, not duplicated.

    venv/bin/python scripts/reextract_memory.py you@example.com 143 150
                                      ^ account       ^ note (interaction) ids
"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import db  # noqa: E402
import extraction  # noqa: E402
import graph  # noqa: E402
from seed_demo_data import find_user_id  # noqa: E402


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    user_id = find_user_id(sys.argv[1])
    people = {p["id"]: p for p in db.get_all_people(user_id)}
    links = db.get_interaction_links(user_id)
    for note_id in map(int, sys.argv[2:]):
        found = db.get_interactions_by_ids(user_id, [note_id])
        if not found:
            print(f"note {note_id}: not found")
            continue
        note = found[0]
        when = (note.get("date") or date.today().isoformat())[:10]
        extracted = extraction.extract_info(note["raw_text"], reference_date=date.fromisoformat(when), initiative_names=[])
        if not isinstance(extracted, dict):
            print(f"note {note_id}: the model returned something unusable, skipped")
            continue
        keep = dict(note.get("extracted_facts") or {})
        payload = graph.memory_payload(extracted)
        if payload:
            keep["memory"] = payload
            db.update_interaction(user_id, note_id, extracted_facts=keep)
        linked = [{"name": people[l["person_id"]]["name"], "person_id": l["person_id"], "relation": l.get("relation") or ""}
                  for l in links if l["interaction_id"] == note_id and l["person_id"] in people]
        filed = graph.on_capture(user_id, note_id, when, note.get("person_id"), extracted, linked)
        print(f"note {note_id}: {filed['facts']} details, {filed['key_dates']} dates, {filed['links']} links filed")
        for item in filed["items"]:
            print("   -", item)


if __name__ == "__main__":
    main()
