"""
morning_brief.py — Assembles "what does today look like" from the open
tasks (overdue, due today, how many have no date), then has the LLM write
it up as a short, skimmable brief.

Same grounded-generation pattern as agent.py's answers: every fact (counts,
dates) is computed here in plain Python first; the LLM is only ever handed
that finished, accurate context to phrase - never asked to count or recall
anything itself.
"""

import hashlib
from datetime import date, datetime, timezone

import db
import text_utils
import llm_budget
from llm_client import MODEL_NAME


def _format_task_line(task: dict, today: str = None) -> str:
    # A task shows the category (initiative) of the note it came from, e.g.
    # "Fitness" - there is no per-person label any more.
    interaction = task.get("interaction") or {}
    initiative = (interaction.get("initiative") or {}).get("name")
    who = f" ({initiative})" if initiative else ""
    owner = "you" if task.get("owner", "me") == "me" else "someone else"
    when = ""
    due = task.get("due_date")
    if due and today:
        late = (date.fromisoformat(today) - date.fromisoformat(due)).days
        if late > 0:
            when = f" - {late} day{'s' if late != 1 else ''} overdue (was due {due})"
        elif task.get("due_time"):
            when = f" - due at {str(task['due_time'])[:5]}"
    return f"- {task['description']}{who} [owed by {owner}]{when}"


def _gather_brief_data(user_id: str) -> dict:
    today_str = date.today().isoformat()

    open_tasks = db.get_all_tasks_with_context(user_id, status="open")
    due_today = [t for t in open_tasks if t.get("due_date") == today_str]
    overdue = [t for t in open_tasks if t.get("due_date") and t["due_date"] < today_str]
    no_due_date_count = sum(1 for t in open_tasks if not t.get("due_date"))

    return {
        "today": today_str,
        "due_today": due_today,
        "overdue": overdue,
        "no_due_date_count": no_due_date_count,
    }


def _build_context_block(data: dict) -> str:
    lines = [f"Today's date: {data['today']}"]

    lines.append(f"\nTasks due today ({len(data['due_today'])}):")
    lines += [_format_task_line(t, data["today"]) for t in data["due_today"]] or ["(none)"]

    lines.append(f"\nOverdue open tasks ({len(data['overdue'])}):")
    lines += [_format_task_line(t, data["today"]) for t in data["overdue"]] or ["(none)"]

    if data["no_due_date_count"]:
        lines.append(
            f"\n{data['no_due_date_count']} other open task(s) have no due date - "
            "not urgent, don't list them individually."
        )

    return "\n".join(lines)


_USAGE_MODE_TONE = {
    "work": "\nThis person uses the app for WORK: frame the day like a professional's - clients, "
            "colleagues, deadlines. Crisp and businesslike, still friendly.",
    "personal": "\nThis person uses the app for their PERSONAL life: friends, family, health, home. "
                "Warm and relaxed, never corporate - say 'to-dos' rather than 'tasks'.",
}


# One brief per user per day, written once and then kept. It is a SNAPSHOT of the
# morning - what was overdue, due and coming up when it was first needed that day -
# so it does not rewrite itself when you tick a task off or add one later (the live
# lists on the Today page are for that). It is stored in the daily_brief table so the
# in-app view, the Email button and the morning cron all show the same text, and it
# survives restarts; _memory is the fallback until schema.sql section 30 has run.
_memory: dict = {}


def _fingerprint(context: str, usage_mode) -> str:
    return hashlib.sha256(f"{context}|{usage_mode or ''}".encode()).hexdigest()[:20]


def _todays_brief(user_id: str, brief_date: str):
    """(text, written_at ISO) for today's stored brief, or None."""
    try:
        row = db.get_daily_brief(user_id, brief_date)
    except Exception:
        row = None  # table not created yet
    if row and row.get("brief"):
        return row["brief"], row.get("created_at")
    held = _memory.get(user_id)
    if held and held[0] == brief_date:
        return held[1], held[2]
    return None


def _remember_brief(user_id: str, brief_date: str, fingerprint: str, brief: str) -> str:
    written_at = datetime.now(timezone.utc).isoformat()
    if len(_memory) > 500:
        _memory.clear()
    _memory[user_id] = (brief_date, brief, written_at)
    try:
        db.save_daily_brief(user_id, brief_date, fingerprint, brief, written_at)
    except Exception as e:
        print(f"[warn] couldn't store the daily brief (run schema.sql section 30?): {e}")
    return written_at


def get_morning_brief(user_id: str, refresh: bool = False):
    """Today's brief and when it was written: (text, written_at ISO). Written the first
    time it is needed each day, then returned unchanged. `refresh=True` writes a new one
    from the current state of things (the Refresh button)."""
    today = date.today().isoformat()
    if not refresh:
        kept = _todays_brief(user_id, today)
        if kept:
            return kept
    text, fingerprint = _write_brief(user_id)
    return text, _remember_brief(user_id, today, fingerprint, text)


def generate_morning_brief(user_id: str) -> str:
    """The brief as plain text (used by the email paths)."""
    return get_morning_brief(user_id)[0]


def _write_brief(user_id: str):
    """Gathers the facts and has the model phrase them: (text, fingerprint of the facts)."""
    data = _gather_brief_data(user_id)

    if not data["due_today"] and not data["overdue"]:
        return ("Nothing urgent today - no tasks are due and nothing is overdue. Clear day.", "quiet")

    context = _build_context_block(data)
    usage_mode = db.get_user_preference(user_id).get("usage_mode")
    fingerprint = _fingerprint(context, usage_mode)

    system_prompt = """You write a short, warm, SKIMMABLE morning brief for a personal notes-and-tasks app, using ONLY the
data given below - never invent tasks not listed. Use exactly this structure, in this order,
leaving out any section whose list is empty:
1. One-sentence opening: how the day looks at a glance. If anything is overdue, say how many in this sentence.
2. "### Overdue (N)" where N is the number of overdue tasks - every item from "Overdue open tasks" as a short bullet,
   keeping how many days overdue it is. This is the most important section, so it comes first and stands alone:
   never mix overdue items into the due-today list.
3. "### Due today" - every item from "Tasks due today" as a short bullet (include the time when one is given).
This should read in under 20 seconds, not be studied - keep it tight, no filler, no invented urgency."""

    # Tone follows what the account is used for (Settings > Using MyConfía
    # for). .get() rather than [] - before schema.sql section 25 is applied
    # the column simply isn't there, and the brief should read as before.
    system_prompt += _USAGE_MODE_TONE.get(usage_mode, "")

    response = llm_budget.chat(MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": context},
        ],
        temperature=0.4,
    )
    return text_utils.normalize_text(response.choices[0].message.content), fingerprint
