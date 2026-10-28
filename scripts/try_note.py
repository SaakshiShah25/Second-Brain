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
    print(f"Category:   {ex.get('initiative') or 'Others (no match)'}")
    if ex.get("suggested_initiative"):
        print(f"Suggested new category: {ex['suggested_initiative']}")
    print(f"Summary:    {text_utils.strip_bullet(ex.get('summary', ''))}")
    if ex.get("date_mentioned"):
        print(f"Note date:  {date_utils.resolve_relative_phrase(ex['date_mentioned']) or ex['date_mentioned']}")
    for label, key in (("Decisions", "decisions"), ("Concerns", "concerns")):
        for item in ex.get(key) or []:
            print(f"{label}:  {text_utils.strip_bullet(item)}")
    tasks = ex.get("follow_ups") or []
    if not tasks:
        print("Tasks:      none")
    for t in tasks:
        due = date_utils.resolve_relative_phrase(t.get("due_date"))
        time_ = date_utils.to_valid_time(t.get("due_time"))
        if time_ and not due:
            due = date.today().isoformat()
        when = "no date" if not due else (f"{due} ({date.fromisoformat(due).strftime('%a')})" + (f" at {time_}" if time_ else ""))
        who = "someone else owes" if t.get("owner") == "them" else "me"
        print(f"Task:       {text_utils.strip_bullet(t.get('description', ''))}  [{when}; {who}]")


if __name__ == "__main__":
    main()
