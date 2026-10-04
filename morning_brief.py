"""
morning_brief.py — Assembles "what does today look like" across open
tasks, today's Google Calendar events, and relationships that have gone
quiet, then has the LLM write it up as a short, skimmable brief.

Same grounded-generation pattern as retrieval.py's generate_briefing():
every fact (counts, names, dates) is computed here in plain Python first;
the LLM is only ever handed that finished, accurate context to phrase -
never asked to count or recall anything itself. That's the same fix
applied to retrieval.answer_aggregate_query() after a "most interactions"
question once got answered from an incomplete semantic-search sample
instead of a real count - a daily brief is exactly the kind of factual
summary that bug class would hit hardest.
"""

from datetime import date, datetime

import db
import google_calendar
import text_utils
from llm_client import get_client, MODEL_NAME

STALE_THRESHOLD_DAYS = 30
MAX_STALE_SHOWN = 5


def _days_ago(date_str: str) -> int:
    return (date.today() - datetime.fromisoformat(date_str).date()).days


def _format_task_line(task: dict) -> str:
    # Prefer the task's own directly-linked person (who this SPECIFIC
    # follow-up EXPLICITLY names) - safe to show regardless of owner.
    # Only default to the note's PRIMARY person when THEY own the task -
    # that's the one case where "no one specific was named" reasonably
    # means "the person this note is about". For a task I own with no one
    # named, defaulting to the note's primary person is misleading (e.g.
    # my fitness trainer mentions I should buy new gear - that's MY
    # to-do, not hers) - fall to the note's initiative instead (e.g.
    # "Fitness"), same reasoning as a fully standalone/person-less note.
    interaction = task.get("interaction") or {}
    owner_raw = task.get("owner", "me")
    # "Unknown" is a real, explicit match (a person was involved but
    # wasn't named) - not the same as no person at all. Showing the
    # literal word "Unknown" in the brief reads as broken, not
    # informative, so treat it the same as no person and fall through to
    # the initiative, same as DigestPage.tsx's realName().
    def _real_name(name):
        return name if name and name.strip().lower() != "unknown" else None

    person = _real_name((task.get("person") or {}).get("name"))
    if not person and owner_raw != "me":
        person = _real_name((interaction.get("person") or {}).get("name"))
    initiative = (interaction.get("initiative") or {}).get("name")
    who = f" ({person})" if person else (f" ({initiative})" if initiative else "")
    owner = "you" if owner_raw == "me" else "them"
    return f"- {task['description']}{who} [owed by {owner}]"


def _gather_brief_data(user_id: str) -> dict:
    today_str = date.today().isoformat()

    open_tasks = db.get_all_tasks_with_context(user_id, status="open")
    due_today = [t for t in open_tasks if t.get("due_date") == today_str]
    overdue = [t for t in open_tasks if t.get("due_date") and t["due_date"] < today_str]
    no_due_date_count = sum(1 for t in open_tasks if not t.get("due_date"))

    calendar_events = google_calendar.list_events_for_date(user_id, today_str)

    people = db.get_people_with_last_interaction(user_id)
    stale = sorted(
        (
            {**p, "days_ago": _days_ago(p["last_interaction_date"])}
            for p in people
            if p.get("last_interaction_date") and _days_ago(p["last_interaction_date"]) >= STALE_THRESHOLD_DAYS
        ),
        key=lambda p: -p["days_ago"],
    )[:MAX_STALE_SHOWN]

    return {
        "today": today_str,
        "due_today": due_today,
        "overdue": overdue,
        "no_due_date_count": no_due_date_count,
        "calendar_events": calendar_events,
        "stale_people": stale,
    }


def _build_context_block(data: dict) -> str:
    lines = [f"Today's date: {data['today']}"]

    lines.append(f"\nTasks due today ({len(data['due_today'])}):")
    lines += [_format_task_line(t) for t in data["due_today"]] or ["(none)"]

    lines.append(f"\nOverdue open tasks ({len(data['overdue'])}):")
    lines += [_format_task_line(t) for t in data["overdue"]] or ["(none)"]

    if data["no_due_date_count"]:
        lines.append(
            f"\n{data['no_due_date_count']} other open task(s) have no due date - "
            "not urgent, don't list them individually."
        )

    lines.append(f"\nCalendar events today ({len(data['calendar_events'])}):")
    if data["calendar_events"]:
        for e in data["calendar_events"]:
            lines.append(f"- {e['summary']} at {e['start']}")
    else:
        lines.append("(none, or Google Calendar isn't connected)")

    lines.append(f"\nRelationships that have gone quiet, {STALE_THRESHOLD_DAYS}+ days ({len(data['stale_people'])} shown):")
    if data["stale_people"]:
        for p in data["stale_people"]:
            lines.append(f"- {p['name']}, last talked {p['days_ago']} days ago")
    else:
        lines.append("(none)")

    return "\n".join(lines)


def generate_morning_brief(user_id: str) -> str:
    data = _gather_brief_data(user_id)

    if not data["due_today"] and not data["overdue"] and not data["calendar_events"] and not data["stale_people"]:
        return "Nothing urgent today - no tasks due, no calendar events, and no relationships have gone quiet. Clear day."

    context = _build_context_block(data)

    system_prompt = """You write a short, warm, SKIMMABLE morning brief for a personal-CRM app, using ONLY the
data given below - never invent tasks, meetings, or people not listed. Structure:
1. One-sentence opening: how the day looks at a glance (plain language, not a data dump).
2. "Today's tasks" - every item from "Tasks due today" AND "Overdue open tasks" as short bullets,
   clearly labeling overdue ones as overdue. Skip this section entirely if both lists are empty.
3. "On your calendar" - every item from "Calendar events today" as a short bullet with its time.
   Skip entirely if empty.
4. "Worth reconnecting with" - the relationships that have gone quiet, one short line each. Skip if empty.
This should read in under 20 seconds, not be studied - keep it tight, no filler, no invented urgency."""

    client = get_client()
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": context},
        ],
        temperature=0.4,
    )
    return text_utils.normalize_text(response.choices[0].message.content)
