"""
scripts/try_note.py — Shows what the app would make of a note WITHOUT saving anything: whether the
message is treated as a note, a question or a refusal, and (for a note) the category, summary,
decisions, concerns and tasks with their resolved dates and owners. Uses the real AI models, so it
needs GROQ_API_KEY (and uses a little of its quota). Nothing is written to the database.

    python scripts/try_note.py "Send Priya the deck by Friday 5pm"
    python scripts/try_note.py --categories Work,Personal,Fitness "Ran 5k this morning"
    python scripts/try_note.py            # then type or paste a note, Ctrl-D to finish
"""

import argparse
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import date_utils  # noqa: E402
import extraction  # noqa: E402
import intent  # noqa: E402
import moderation  # noqa: E402
import text_utils  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Preview how a message would be handled (saves nothing).")
    parser.add_argument("text", nargs="?", help="the message; omit to read it from stdin")
    parser.add_argument("--categories", default="Work,Personal,Learning,Health",
                        help="your category names, comma separated (default: %(default)s)")
    args = parser.parse_args()
    text = args.text if args.text is not None else sys.stdin.read()
    text = text.strip()
    if not text:
        sys.exit("Give it some text.")

    print(f"Today is {date.today().strftime('%A %d %b %Y')}\n")

    verdict = moderation.check(text)
    if not verdict.get("safe"):
        why = "the safety check couldn't run" if verdict.get("unavailable") else f"safety check: {verdict.get('category')}"
        print(f"BLOCKED ({why}) - the app would refuse this and save nothing.")
        return

    route = intent.classify(text)
    if route == "ask":
        print("ROUTE: question - the app would search your notes/tasks and answer from them.")
        return
    if route == "out_of_scope":
        print("ROUTE: refusal - 'not something I can help with', with a 'Save it as a note instead' button.")
        return
    print("ROUTE: note - it would be saved.\n")

    names = [c.strip() for c in args.categories.split(",") if c.strip()]
    ex = extraction.extract_info(text, None, names)
    if ex.get("date_mentioned"):
        print(f"Note date:  {date_utils.resolve_relative_phrase(ex['date_mentioned']) or ex['date_mentioned']}")
    parts = extraction.note_parts(text, ex)
    print(f"Filed as {len(parts)} note{'s' if len(parts) != 1 else ''}:" if len(parts) > 1 else "")
    for n, part in enumerate(parts, 1):
        print(f"--- {'Part %d: ' % n if len(parts) > 1 else ''}{part.get('initiative') or 'Others (no match)'}")
        if len(parts) > 1:
            print(f"Raw text:   {part['raw_text']}")
        if part.get("suggested_initiative"):
            print(f"Suggested new category: {part['suggested_initiative']}")
        if part.get("section"):
            print(f"Topic:      {text_utils.clean_section(part['section']) or '-'}")
        decisions = [text_utils.strip_bullet(x) for x in part.get("decisions") or []]
        concerns = [text_utils.strip_bullet(x) for x in part.get("concerns") or []]
        follow_ups = part.get("follow_ups") or []
        tasks = [text_utils.clean_task_text(t.get("description", "") if isinstance(t, dict) else str(t)) for t in follow_ups]
        points = text_utils.dedupe_points(text_utils.as_bullets(part.get("summary") or ""), decisions + concerns + tasks)
        print("Key points: " + (points.replace("\n", "\n            ") if points else "none"))
        for item in decisions:
            print(f"Decision:   {item}")
        for item in concerns:
            print(f"Concern:    {item}")
        if not follow_ups:
            print("Tasks:      none")
        for t in follow_ups:
            if not isinstance(t, dict):
                continue
            due = date_utils.resolve_relative_phrase(t.get("due_date"))
            time_ = date_utils.to_valid_time(t.get("due_time"))
            if time_ and not due:
                due = date.today().isoformat()
            when = "no date" if not due else (f"{due} ({date.fromisoformat(due).strftime('%a')})" + (f" at {time_}" if time_ else ""))
            who = "someone else owes" if t.get("owner") == "them" else "me"
            print(f"Task:       {text_utils.clean_task_text(t.get('description', ''))}  [{when}; {who}]")


if __name__ == "__main__":
    main()
