"""
mcp_tools.py - what Claude can do in MyConfía, as MCP tools (served by api/routers/mcp.py).

Every tool works for ONE person: the user id comes from the verified token, never from an argument. Tools reuse the app's
own route functions wherever they exist (tasks, spaces, lists, notes), so the same validation, the same limits and the
same search-index updates apply as in the app. A tool returns

    text   what Claude reads and can say back
    data   a structured copy, which the interactive view (mcp_ui.py) draws

Things that cannot be undone (deleting) need `confirm: true`; the descriptions tell Claude to ask the person first.
"""

import asyncio
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool

import db
import moderation
from api.routers import ask as ask_router
from api.routers import capture as capture_router
from api.routers import chat as chat_router
from api.routers import initiatives as initiatives_router
from api.routers import lists as lists_router
from api.routers import notes as notes_router
from api.routers import tasks as tasks_router
from api.schemas import (ChatRequest, InitiativeCreate, InitiativeUpdate, InteractionUpdate, ListCreate, ListUpdate,
                         NoteCreate, TaskCreate, TaskStatusUpdate)

PRIORITY_RANK = {"high": 0, "normal": 1, "low": 2}
UPCOMING_DAYS = 7
MAX_ITEMS = 200


class ToolError(Exception):
    """A problem the person should hear about in plain words (shown to Claude as the tool's error)."""


# ---------------------------------------------------------------- helpers

def _hhmm(value) -> Optional[str]:
    return str(value)[:5] if value else None


def _tz_for(user_id: str, name: Optional[str]) -> ZoneInfo:
    """The person's time zone: the one asked for, else the one their phone registered for reminders, else UTC."""
    candidates = [name]
    if not name:
        try:
            candidates = [s.get("timezone") for s in db.get_push_subscriptions(user_id)][:1]
        except Exception:  # noqa: BLE001
            candidates = []
    for c in candidates:
        try:
            if c:
                return ZoneInfo(c)
        except Exception:  # noqa: BLE001
            pass
    return ZoneInfo("UTC")


def _spaces(user_id: str) -> list:
    return db.get_initiatives(user_id)


def resolve_space(user_id: str, value, spaces: Optional[list] = None) -> Optional[int]:
    """A space given by name or id -> its id; None for "Others"/"none". Raises ToolError when it isn't there."""
    if value is None:
        return None
    text = str(value).strip()
    if text.lower() in ("", "others", "other", "none", "no space"):
        return None
    spaces = spaces if spaces is not None else _spaces(user_id)
    if text.isdigit() and any(s["id"] == int(text) for s in spaces):
        return int(text)
    for s in spaces:
        if s["name"].casefold() == text.casefold():
            return s["id"]
    for s in spaces:  # a close name ("work" for "Work & Clients")
        if text.casefold() in s["name"].casefold():
            return s["id"]
    names = ", ".join(s["name"] for s in spaces) or "none yet"
    raise ToolError(f"There's no space called '{text}'. Your spaces: {names}.")


def _list_by(user_id: str, value, space_id: Optional[int] = None, create: bool = False) -> dict:
    lists = db.get_lists(user_id)
    text = str(value).strip()
    if text.isdigit():
        hit = next((l for l in lists if l["id"] == int(text)), None)
        if hit:
            return hit
    pool = [l for l in lists if (space_id is None or (l.get("initiative_id") or None) == space_id)] or lists
    hit = next((l for l in pool if l["name"].casefold() == text.casefold()), None)
    if hit:
        return hit
    if create:
        return lists_router.create_list(ListCreate(name=text, initiative_id=space_id), user_id=user_id)
    names = ", ".join(l["name"] for l in lists) or "none yet"
    raise ToolError(f"There's no list called '{text}'. Your lists: {names}.")


def _http(fn: Callable, *a, **k):
    """Runs a route function; its HTTP errors become plain tool errors."""
    try:
        return fn(*a, **k)
    except HTTPException as e:
        raise ToolError(str(e.detail))


def task_view(t: dict, names: dict) -> dict:
    ini = t["initiative_id"] if "initiative_id" in t else ((t.get("interaction") or {}).get("initiative") or {}).get("id")
    lst = t.get("item_list") or {}
    return {
        "id": t["id"],
        "description": t.get("description") or "",
        "detail": t.get("detail"),
        "status": t.get("status") or "open",
        "priority": t.get("priority") or "normal",
        "due_date": t.get("due_date"),
        "due_time": _hhmm(t.get("due_time")),
        "repeat": t.get("repeat"),
        "remind_on": t.get("remind_on"),
        "remind_time": _hhmm(t.get("remind_time")),
        "remind_before": t.get("remind_before"),
        "space_id": ini,
        "space": names.get(ini, "Others") if ini else "Others",
        "list_id": t.get("list_id"),
        "list": lst.get("name"),
        "list_emoji": lst.get("emoji"),
    }


def _names(user_id: str, spaces: Optional[list] = None) -> dict:
    return {s["id"]: s["name"] for s in (spaces if spaces is not None else _spaces(user_id))}


def _space_dicts(spaces: list) -> list:
    return [{"id": s["id"], "name": s["name"], "color": s.get("color")} for s in spaces]


def _is_overdue(t: dict, today: str, clock: str) -> bool:
    if t["status"] != "open" or not t["due_date"]:
        return False
    if t["due_date"] != today:
        return t["due_date"] < today
    return bool(t["due_time"]) and t["due_time"] < clock


def _sort_key(t: dict):
    return (PRIORITY_RANK.get(t["priority"], 1), t["due_date"] or "9999-12-31", t["due_time"] or "99", t["id"])


def _line(t: dict) -> str:
    bits = []
    if t["due_date"]:
        bits.append(f"due {t['due_date']}" + (f" {t['due_time']}" if t["due_time"] else ""))
    if t["priority"] != "normal":
        bits.append(f"{t['priority']} priority")
    if t["remind_before"] is not None:
        bits.append(f"reminder {t['remind_before']} min before")
    elif t["remind_on"]:
        bits.append(f"reminder {t['remind_on']}" + (f" {t['remind_time']}" if t["remind_time"] else ""))
    if t["space"] != "Others":
        bits.append(t["space"])
    if t["list"]:
        bits.append(f"list: {t['list']}")
    return f"- [{t['id']}] {t['description']}" + (f" ({', '.join(bits)})" if bits else "")


def _all_tasks(user_id: str, spaces: Optional[list] = None) -> list:
    names = _names(user_id, spaces)
    return [task_view(t, names) for t in db.get_all_tasks_with_context(user_id)]


def _one_task(user_id: str, task_id: int) -> dict:
    try:
        row = db.get_task(user_id, int(task_id))
    except Exception:  # noqa: BLE001 - .single() raises when it isn't there
        row = None
    if not row:
        raise ToolError(f"There's no to-do with id {task_id}.")
    return task_view(row, _names(user_id))


# ---------------------------------------------------------------- reading

def show_today(user_id: str, args: dict) -> dict:
    tz = _tz_for(user_id, args.get("timezone"))
    now = datetime.now(tz)
    today, clock = now.date().isoformat(), now.strftime("%H:%M")
    horizon = (now.date() + timedelta(days=UPCOMING_DAYS)).isoformat()
    spaces = _spaces(user_id)
    tasks = [t for t in _all_tasks(user_id, spaces) if t["status"] == "open" and not t["list_id"]]
    overdue = sorted((t for t in tasks if _is_overdue(t, today, clock)), key=lambda t: (t["due_date"] or "", t["due_time"] or "", t["id"]))
    over_ids = {t["id"] for t in overdue}
    due_today = [t for t in tasks if t["due_date"] == today and t["id"] not in over_ids]
    reminded = [t for t in tasks if t["remind_on"] == today and t["id"] not in over_ids and not (t["due_date"] and t["due_date"] <= today)]
    today_items = sorted(due_today + reminded, key=_sort_key)
    shown = over_ids | {t["id"] for t in today_items}
    important = sorted((t for t in tasks if t["priority"] == "high" and t["id"] not in shown), key=_sort_key)
    upcoming = sorted((t for t in tasks if t["due_date"] and today < t["due_date"] <= horizon), key=_sort_key)
    later = sorted((t for t in tasks if t["due_date"] and t["due_date"] > horizon), key=_sort_key)
    anytime = sorted((t for t in tasks if not t["due_date"]), key=_sort_key)
    data = {
        "view": "today", "date": today, "time": clock, "timezone": str(tz), "tab": args.get("view") or "today",
        "overdue": overdue, "today": today_items, "important": important, "upcoming": upcoming, "later": later, "anytime": anytime,
        "spaces": _space_dicts(spaces),
    }
    lines = [f"Today is {today}, {clock} ({tz})."]
    for title, rows in (("Overdue", overdue), ("Today", today_items), ("High priority", important), ("Next 7 days", upcoming), ("Later", later), ("Anytime", anytime)):
        if rows:
            lines.append(f"\n{title} ({len(rows)}):")
            lines += [_line(t) for t in rows[:25]]
    if len(lines) == 1:
        lines.append("Nothing open - a clear plate.")
    return {"text": "\n".join(lines), "data": data}


def list_tasks(user_id: str, args: dict) -> dict:
    spaces = _spaces(user_id)
    space_id = resolve_space(user_id, args["space"], spaces) if "space" in args else "any"
    status = args.get("status", "open")
    query = (args.get("query") or "").casefold().split()
    tz = _tz_for(user_id, args.get("timezone"))
    now = datetime.now(tz)
    today, clock = now.date().isoformat(), now.strftime("%H:%M")
    rows = _all_tasks(user_id, spaces)
    out = []
    for t in rows:
        if status in ("open", "done") and t["status"] != status:
            continue
        if space_id != "any" and (t["space_id"] or None) != space_id:
            continue
        if args.get("list") and (t["list"] or "").casefold() != str(args["list"]).casefold():
            continue
        if args.get("priority") and t["priority"] != args["priority"]:
            continue
        if args.get("overdue_only") and not _is_overdue(t, today, clock):
            continue
        if args.get("due_before") and not (t["due_date"] and t["due_date"] <= args["due_before"]):
            continue
        if args.get("due_after") and not (t["due_date"] and t["due_date"] >= args["due_after"]):
            continue
        hay = f"{t['description']} {t['detail'] or ''} {t['list'] or ''} {t['space']}".casefold()
        if query and not all(q in hay for q in query):
            continue
        out.append(t)
    out.sort(key=_sort_key)
    limit = max(1, min(int(args.get("limit") or 50), MAX_ITEMS))
    shown = out[:limit]
    data = {"view": "list", "date": today, "title": args.get("title") or "To-dos", "tasks": shown, "total": len(out), "spaces": _space_dicts(spaces)}
    text = f"{len(out)} to-do(s)" + (f", showing {len(shown)}" if len(out) > len(shown) else "") + ":\n" + "\n".join(_line(t) for t in shown) if shown else "No to-dos match."
    return {"text": text, "data": data}


def show_task(user_id: str, args: dict) -> dict:
    t = _one_task(user_id, args["task_id"])
    spaces = _spaces(user_id)
    return {"text": _line(t) + (f"\n{t['detail']}" if t["detail"] else ""), "data": {"view": "task", "task": t, "spaces": _space_dicts(spaces), "date": date.today().isoformat()}}


def _space_summary(user_id: str, spaces: list) -> list:
    notes = db.get_all_interactions_with_context(user_id)
    tasks = _all_tasks(user_id, spaces)
    lists = db.get_lists(user_id)
    out = []
    for s in [*spaces, {"id": None, "name": "Others", "color": None}]:
        sid = s["id"]
        out.append({
            "id": sid, "name": s["name"], "color": s.get("color"),
            "notes": sum(1 for n in notes if (n.get("initiative_id") or None) == sid),
            "todos": sum(1 for t in tasks if t["status"] == "open" and not t["list_id"] and (t["space_id"] or None) == sid),
            "lists": sum(1 for l in lists if (l.get("initiative_id") or None) == sid),
        })
    return out


def list_spaces(user_id: str, args: dict) -> dict:
    spaces = _spaces(user_id)
    summary = _space_summary(user_id, spaces)
    data = {"view": "spaces", "spaces": summary, "selected": None}
    text = "Spaces:\n" + "\n".join(f"- {s['name']} (id {s['id']}): {s['notes']} notes, {s['todos']} open to-dos, {s['lists']} lists" for s in summary)
    return {"text": text, "data": data}


def _space_detail(user_id: str, space_id: Optional[int], spaces: list) -> dict:
    names = _names(user_id, spaces)
    notes = [n for n in db.get_all_interactions_with_context(user_id) if (n.get("initiative_id") or None) == space_id]
    tasks = [t for t in _all_tasks(user_id, spaces) if (t["space_id"] or None) == space_id]
    lists = [l for l in db.get_lists(user_id) if (l.get("initiative_id") or None) == space_id]
    notes.sort(key=lambda n: (n.get("date") or "", n["id"]), reverse=True)
    return {
        "space": {"id": space_id, "name": names.get(space_id, "Others") if space_id else "Others", "color": next((s.get("color") for s in spaces if s["id"] == space_id), None)},
        "notes": [{"id": n["id"], "date": n.get("date"), "summary": n.get("summary") or (n.get("raw_text") or "")[:160]} for n in notes[:MAX_ITEMS]],
        "todos": sorted((t for t in tasks if not t["list_id"] and t["status"] == "open"), key=_sort_key),
        "lists": [{"id": l["id"], "name": l["name"], "emoji": l.get("emoji"),
                   "items": [t for t in tasks if t["list_id"] == l["id"]]} for l in lists],
    }


def open_space(user_id: str, args: dict) -> dict:
    spaces = _spaces(user_id)
    space_id = resolve_space(user_id, args["space"], spaces)
    detail = _space_detail(user_id, space_id, spaces)
    data = {"view": "spaces", "spaces": _space_summary(user_id, spaces), "selected": detail}
    lines = [f"{detail['space']['name']}: {len(detail['notes'])} notes, {len(detail['todos'])} open to-dos, {len(detail['lists'])} lists."]
    if detail["notes"]:
        lines.append("\nNotes:")
        lines += [f"- [{n['id']}] {n['date'] or ''} {n['summary']}" for n in detail["notes"][:15]]
    if detail["todos"]:
        lines.append("\nTo-dos:")
        lines += [_line(t) for t in detail["todos"][:25]]
    for l in detail["lists"]:
        lines.append(f"\nList {l['emoji'] or ''} {l['name']} (id {l['id']}):")
        lines += [("  " + _line(t)) for t in l["items"][:25]]
    return {"text": "\n".join(lines), "data": data}


def list_notes(user_id: str, args: dict) -> dict:
    spaces = _spaces(user_id)
    space_id = resolve_space(user_id, args["space"], spaces) if "space" in args else "any"
    query = (args.get("query") or "").casefold().split()
    out = []
    for n in db.get_all_interactions_with_context(user_id):
        if space_id != "any" and (n.get("initiative_id") or None) != space_id:
            continue
        hay = f"{n.get('summary') or ''} {n.get('raw_text') or ''}".casefold()
        if query and not all(q in hay for q in query):
            continue
        out.append({"id": n["id"], "date": n.get("date"), "space": (n.get("initiative") or {}).get("name") or "Others",
                    "summary": n.get("summary") or "", "text": n.get("raw_text") or ""})
    out.sort(key=lambda n: (n["date"] or "", n["id"]), reverse=True)
    limit = max(1, min(int(args.get("limit") or 20), 100))
    shown = out[:limit]
    text = (f"{len(out)} note(s):\n" + "\n".join(f"- [{n['id']}] {n['date'] or ''} ({n['space']}) {n['summary'] or n['text'][:120]}" for n in shown)) if shown else "No notes match."
    return {"text": text, "data": {"view": "notes", "notes": shown, "total": len(out)}}


# ---------------------------------------------------------------- capture and questions (the AI)

class _NoRequest:
    """The capture pipeline asks whether the caller hung up; an MCP call has no such socket."""
    async def is_disconnected(self) -> bool:
        return False


async def capture(user_id: str, args: dict) -> dict:
    text = (args.get("text") or "").strip()
    if not text:
        raise ToolError("Give me something to save.")
    check = await run_in_threadpool(moderation.check, text)
    if not check["safe"]:
        raise ToolError(moderation.UNAVAILABLE_MESSAGE if check.get("unavailable") else "I can't save that.")
    space_id = None
    if args.get("space"):
        space_id = await run_in_threadpool(resolve_space, user_id, args["space"])
    try:
        result = await capture_router._capture_text_core(user_id, text, None, None, _NoRequest(), initiative_id=space_id)
    except HTTPException as e:
        raise ToolError(str(e.detail))
    parts = []
    lines = []
    for p in result.get("parts", []):
        where = p.get("initiative_name") or "Others"
        parts.append({
            "space": where, "space_id": p.get("initiative_id"), "suggested_space": p.get("suggested_initiative"),
            "note_saved": p.get("interaction_id") is not None, "summary": p.get("summary") or "",
            "decisions": p.get("decisions") or [], "concerns": p.get("concerns") or [],
            "tasks": [{"id": t["id"], "description": t["description"], "due_date": t.get("due_date"), "due_time": _hhmm(t.get("due_time")),
                       "repeat": t.get("repeat"), "list": t.get("list_name"), "list_emoji": t.get("list_emoji")} for t in p.get("tasks_created", [])],
        })
        if p.get("interaction_id") is not None:
            lines.append(f"Saved a note in {where}: {p.get('summary') or ''}".strip())
        for t in p.get("tasks_created", []):
            lines.append(f"Added to-do [{t['id']}] {t['description']}" + (f" (due {t['due_date']})" if t.get("due_date") else "") + f" in {where}")
    if result.get("date_warning"):
        lines.append(result["date_warning"])
    return {"text": "\n".join(lines) or "Saved.", "data": {"view": "capture", "text": text, "parts": parts, "warning": result.get("date_warning")}}


async def ask_confia(user_id: str, args: dict) -> dict:
    question = (args.get("question") or "").strip()
    if not question:
        raise ToolError("What would you like to know?")
    check = await run_in_threadpool(moderation.check, question)
    if not check["safe"]:
        raise ToolError(moderation.UNAVAILABLE_MESSAGE if check.get("unavailable") else "I can't help with that.")
    try:
        result = await run_in_threadpool(chat_router._answer_question, user_id, ChatRequest(text=question, history=[]))
    except HTTPException as e:
        raise ToolError(str(e.detail))
    answer = result.get("answer") or ""
    sources = [{"kind": s.get("kind"), "id": s.get("id"), "title": s.get("title"), "date": s.get("date")} for s in (result.get("sources") or [])]
    return {"text": answer, "data": {"view": "answer", "question": question, "answer": answer, "sources": sources}}


# ---------------------------------------------------------------- to-dos

def _reminder_fields(args: dict) -> dict:
    out = {}
    if "remind_before_minutes" in args:
        out["remind_before"] = args["remind_before_minutes"]
        if args["remind_before_minutes"] is not None:
            out.update(remind_on=None, remind_time=None)  # one reminder at a time
    if "remind_at" in args:
        value = args["remind_at"]
        if value is None:
            out.update(remind_on=None, remind_time=None)
        else:
            day, _, clock = str(value).replace(" ", "T").partition("T")
            out.update(remind_on=day, remind_time=clock[:5] or None)
            if value is not None:
                out["remind_before"] = None
    return out


def add_task(user_id: str, args: dict) -> dict:
    spaces = _spaces(user_id)
    space_id = resolve_space(user_id, args["space"], spaces) if "space" in args else None
    list_id = _list_by(user_id, args["list"], space_id, create=True)["id"] if args.get("list") else None
    created = _http(tasks_router.create_task, TaskCreate(
        description=args["description"], list_id=list_id, due_date=args.get("due_date"), due_time=args.get("due_time"),
        repeat=args.get("repeat"), initiative_id=space_id), user_id=user_id)
    extra = {}
    if args.get("priority"):
        extra["priority"] = args["priority"]
    if args.get("detail"):
        extra["detail"] = args["detail"]
    extra.update(_reminder_fields(args))
    if extra:
        _http(tasks_router.update_task, created["id"], TaskStatusUpdate(**extra), user_id=user_id)
    t = _one_task(user_id, created["id"])
    return {"text": "Added: " + _line(t), "data": {"view": "task", "task": t, "spaces": _space_dicts(spaces), "date": date.today().isoformat(), "created": True}}


def update_task(user_id: str, args: dict) -> dict:
    task_id = int(args["task_id"])
    spaces = _spaces(user_id)
    fields: dict[str, Any] = {}
    for key in ("description", "detail", "due_date", "due_time", "priority", "repeat", "status"):
        if key in args:
            fields[key] = args[key] if args[key] != "" else None
    if "space" in args:
        fields["initiative_id"] = resolve_space(user_id, args["space"], spaces)
    if "list" in args:
        fields["list_id"] = _list_by(user_id, args["list"], create=True)["id"] if args["list"] else None
    fields.update(_reminder_fields(args))
    if not fields:
        raise ToolError("Nothing to change - say what to update.")
    _http(tasks_router.update_task, task_id, TaskStatusUpdate(**fields), user_id=user_id)
    t = _one_task(user_id, task_id)
    return {"text": "Updated: " + _line(t), "data": {"view": "task", "task": t, "spaces": _space_dicts(spaces), "date": date.today().isoformat()}}


def complete_task(user_id: str, args: dict) -> dict:
    done = args.get("done", True)
    _http(tasks_router.update_task, int(args["task_id"]), TaskStatusUpdate(status="done" if done else "open"), user_id=user_id)
    t = _one_task(user_id, args["task_id"])
    verb = "Done" if done else "Reopened"
    return {"text": f"{verb}: {t['description']}" + (f" (next on {t['due_date']})" if t.get("repeat") and t.get("due_date") else ""),
            "data": {"view": "task", "task": t, "spaces": _space_dicts(_spaces(user_id)), "date": date.today().isoformat()}}


def _need_confirm(args: dict, what: str):
    if args.get("confirm") is not True:
        raise ToolError(f"Deleting {what} can't be undone. Ask the person to confirm, then call this again with confirm set to true.")


def delete_task(user_id: str, args: dict) -> dict:
    _need_confirm(args, "a to-do")
    t = _one_task(user_id, args["task_id"])
    _http(tasks_router.delete_task, int(args["task_id"]), user_id=user_id)
    return {"text": f"Deleted: {t['description']}", "data": {"view": "deleted", "kind": "to-do", "id": t["id"], "name": t["description"]}}


# ---------------------------------------------------------------- spaces, lists, notes

def create_space(user_id: str, args: dict) -> dict:
    made = _http(initiatives_router.create_initiative, InitiativeCreate(name=args["name"], color=args.get("color")), user_id=user_id)
    return {"text": f"Created the space {made['name']} (id {made['id']}).", "data": {"view": "spaces", "spaces": _space_summary(user_id, _spaces(user_id)), "selected": None}}


def rename_space(user_id: str, args: dict) -> dict:
    space_id = resolve_space(user_id, args["space"])
    if space_id is None:
        raise ToolError("'Others' can't be renamed.")
    fields = {k: args[k] for k in ("name", "color") if k in args}
    _http(initiatives_router.update_initiative, space_id, InitiativeUpdate(**fields), user_id=user_id)
    return {"text": "Space updated.", "data": {"view": "spaces", "spaces": _space_summary(user_id, _spaces(user_id)), "selected": None}}


def delete_space(user_id: str, args: dict) -> dict:
    _need_confirm(args, "a space (its notes go with it)")
    space_id = resolve_space(user_id, args["space"])
    if space_id is None:
        raise ToolError("'Others' can't be deleted.")
    name = _names(user_id).get(space_id, "")
    _http(initiatives_router.delete_initiative, space_id, user_id=user_id)
    return {"text": f"Deleted the space {name}.", "data": {"view": "deleted", "kind": "space", "id": space_id, "name": name}}


def create_list(user_id: str, args: dict) -> dict:
    space_id = resolve_space(user_id, args["space"]) if "space" in args else None
    made = _http(lists_router.create_list, ListCreate(name=args["name"], emoji=args.get("emoji"), initiative_id=space_id), user_id=user_id)
    spaces = _spaces(user_id)
    return {"text": f"Created the list {made.get('emoji') or ''} {made['name']} (id {made['id']}).".replace("  ", " "),
            "data": {"view": "spaces", "spaces": _space_summary(user_id, spaces), "selected": _space_detail(user_id, space_id, spaces)}}


def add_list_item(user_id: str, args: dict) -> dict:
    spaces = _spaces(user_id)
    space_id = resolve_space(user_id, args["space"], spaces) if "space" in args else None
    lst = _list_by(user_id, args["list"], space_id, create=True)
    items = args.get("items") or ([args["text"]] if args.get("text") else [])
    if not items:
        raise ToolError("Say what to add to the list.")
    added = []
    for text in items[:20]:
        made = _http(tasks_router.create_task, TaskCreate(description=text, list_id=lst["id"]), user_id=user_id)
        added.append(made["id"])
    home = lst.get("initiative_id") or None
    return {"text": f"Added {len(added)} item(s) to {lst['name']}: " + ", ".join(str(i) for i in items[:20]),
            "data": {"view": "spaces", "spaces": _space_summary(user_id, spaces), "selected": _space_detail(user_id, home, spaces)}}


def delete_list(user_id: str, args: dict) -> dict:
    _need_confirm(args, "a list and everything on it")
    lst = _list_by(user_id, args["list"], resolve_space(user_id, args["space"]) if "space" in args else None)
    _http(lists_router.delete_list, lst["id"], user_id=user_id)
    return {"text": f"Deleted the list {lst['name']}.", "data": {"view": "deleted", "kind": "list", "id": lst["id"], "name": lst["name"]}}


def add_note(user_id: str, args: dict) -> dict:
    space_id = resolve_space(user_id, args["space"]) if "space" in args else None
    made = _http(notes_router.create_note, NoteCreate(raw_text=args["text"], initiative_id=space_id), user_id=user_id)
    return {"text": f"Saved the note (id {made['id']}).", "data": {"view": "note", "id": made["id"], "text": args["text"], "space": _names(user_id).get(space_id, "Others") if space_id else "Others"}}


def update_note(user_id: str, args: dict) -> dict:
    fields: dict[str, Any] = {}
    if "text" in args:
        fields["raw_text"] = args["text"]
        fields["summary"] = args["text"][:120]
    if "space" in args:
        fields["initiative_id"] = resolve_space(user_id, args["space"])
    if not fields:
        raise ToolError("Nothing to change.")
    _http(notes_router.update_note, int(args["note_id"]), InteractionUpdate(**fields), user_id=user_id)
    return {"text": "Note updated.", "data": {"view": "note", "id": int(args["note_id"])}}


def delete_note(user_id: str, args: dict) -> dict:
    _need_confirm(args, "a note (and the to-dos made from it)")
    _http(notes_router.delete_note, int(args["note_id"]), user_id=user_id)
    return {"text": "Note deleted.", "data": {"view": "deleted", "kind": "note", "id": int(args["note_id"]), "name": ""}}


# ---------------------------------------------------------------- the catalogue

def _schema(props: dict, required: Optional[list] = None) -> dict:
    return {"type": "object", "properties": props, "required": required or [], "additionalProperties": False}


S = {"type": "string"}
SPACE = {"type": "string", "description": "A space by name (or id). \"Others\" means no space."}
PRIORITY = {"type": "string", "enum": ["high", "normal", "low"]}
DATE = {"type": "string", "description": "YYYY-MM-DD"}
TIME = {"type": "string", "description": "24-hour HH:MM"}
CONFIRM = {"type": "boolean", "description": "Must be true. Ask the person to confirm first."}
TASK_ID = {"type": "integer", "description": "The to-do's id (shown in [brackets] in lists)."}

READ = {"readOnlyHint": True, "openWorldHint": False}
WRITE = {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": False, "openWorldHint": False}
DESTROY = {"readOnlyHint": False, "destructiveHint": True, "idempotentHint": False, "openWorldHint": False}

# name -> (title, description, input schema, annotations, view to draw, function)
TOOLS: dict = {
    "show_today": ("Today", "Open the person's Today: what is overdue, due or reminded today, high priority, coming up in the next 7 days and anytime. Use this first when they ask what's on, what to do next or to plan their day.",
                   _schema({"view": {"type": "string", "enum": ["today", "upcoming", "anytime"]}, "timezone": {"type": "string", "description": "IANA zone, e.g. Asia/Kolkata (defaults to the person's own)"}}), READ, "today", show_today),
    "list_tasks": ("List to-dos", "Find to-dos with filters: status, space, list, priority, due window, overdue, or words in the wording.",
                   _schema({"status": {"type": "string", "enum": ["open", "done", "all"]}, "space": SPACE, "list": S, "priority": PRIORITY, "overdue_only": {"type": "boolean"},
                            "due_before": DATE, "due_after": DATE, "query": {"type": "string", "description": "Words that must all appear"}, "limit": {"type": "integer"}, "title": S, "timezone": S}), READ, "today", list_tasks),
    "show_task": ("Open a to-do", "Open one to-do with its due date, reminder, priority and space, where it can be edited.", _schema({"task_id": TASK_ID}, ["task_id"]), READ, "task", show_task),
    "add_task": ("Add a to-do", "Add a to-do. Give a due date (and time) when there is one. A reminder always comes BEFORE the due date: use remind_before_minutes (e.g. 10, 60, 1440) or remind_at (a date/time no later than the due moment).",
                 _schema({"description": S, "due_date": DATE, "due_time": TIME, "priority": PRIORITY, "space": SPACE, "list": {"type": "string", "description": "Put it on this list (made if missing)"},
                          "repeat": {"type": "string", "description": "daily, weekdays, weekly, monthly, yearly or hours:N"}, "detail": S,
                          "remind_before_minutes": {"type": "integer", "minimum": 5, "maximum": 10080}, "remind_at": {"type": "string", "description": "YYYY-MM-DD or YYYY-MM-DDTHH:MM, not after the due moment"}}, ["description"]), WRITE, "task", add_task),
    "update_task": ("Update a to-do", "Change a to-do: wording, due date/time, priority, space, list, repeat, details or reminder. Send null to clear a field. The reminder must come before the due date.",
                    _schema({"task_id": TASK_ID, "description": S, "detail": {"type": ["string", "null"]}, "due_date": {"type": ["string", "null"]}, "due_time": {"type": ["string", "null"]}, "priority": PRIORITY,
                             "space": SPACE, "list": {"type": ["string", "null"]}, "repeat": {"type": ["string", "null"]},
                             "remind_before_minutes": {"type": ["integer", "null"]}, "remind_at": {"type": ["string", "null"]}}, ["task_id"]), WRITE, "task", update_task),
    "complete_task": ("Tick a to-do", "Mark a to-do done (a repeating one moves to its next date), or reopen it with done=false.", _schema({"task_id": TASK_ID, "done": {"type": "boolean"}}, ["task_id"]), WRITE, "task", complete_task),
    "delete_task": ("Delete a to-do", "Permanently delete a to-do. Ask the person to confirm first.", _schema({"task_id": TASK_ID, "confirm": CONFIRM}, ["task_id", "confirm"]), DESTROY, None, delete_task),
    "list_spaces": ("Spaces", "Show all spaces (the person's areas, like Work or Health) with how many notes, to-dos and lists each holds.", _schema({}), READ, "spaces", list_spaces),
    "open_space": ("Open a space", "Open one space: its notes, to-dos and lists.", _schema({"space": SPACE}, ["space"]), READ, "spaces", open_space),
    "create_space": ("Create a space", "Create a new space.", _schema({"name": S, "color": {"type": "string", "description": "#rrggbb"}}, ["name"]), WRITE, "spaces", create_space),
    "rename_space": ("Edit a space", "Rename a space or change its colour.", _schema({"space": SPACE, "name": S, "color": S}, ["space"]), WRITE, "spaces", rename_space),
    "delete_space": ("Delete a space", "Permanently delete a space and its notes. Ask the person to confirm first.", _schema({"space": SPACE, "confirm": CONFIRM}, ["space", "confirm"]), DESTROY, None, delete_space),
    "create_list": ("Create a list", "Create an empty list (a reading list, shopping...) in a space.", _schema({"name": S, "space": SPACE, "emoji": S}, ["name"]), WRITE, "spaces", create_list),
    "add_list_item": ("Add to a list", "Add one or more entries to a list (the list is made if it doesn't exist).", _schema({"list": S, "text": S, "items": {"type": "array", "items": S}, "space": SPACE}, ["list"]), WRITE, "spaces", add_list_item),
    "delete_list": ("Delete a list", "Permanently delete a list and its entries. Ask the person to confirm first.", _schema({"list": S, "space": SPACE, "confirm": CONFIRM}, ["list", "confirm"]), DESTROY, None, delete_list),
    "list_notes": ("List notes", "List the person's notes, newest first, optionally for one space or containing words.", _schema({"space": SPACE, "query": S, "limit": {"type": "integer"}}), READ, None, list_notes),
    "add_note": ("Add a note", "Save a note exactly as written (no AI processing) into a space.", _schema({"text": S, "space": SPACE}, ["text"]), WRITE, None, add_note),
    "update_note": ("Edit a note", "Change a note's text or move it to another space.", _schema({"note_id": {"type": "integer"}, "text": S, "space": SPACE}, ["note_id"]), WRITE, None, update_note),
    "delete_note": ("Delete a note", "Permanently delete a note and the to-dos made from it. Ask the person to confirm first.", _schema({"note_id": {"type": "integer"}, "confirm": CONFIRM}, ["note_id", "confirm"]), DESTROY, None, delete_note),
    "capture": ("Capture", "Save something the person says - a meeting, a thought, a plan - the way MyConfía's chat does: it is read by AI, filed into the right space, key points, decisions and to-dos with dates are pulled out. Use this for free-form text; use add_task for one precise to-do.",
                _schema({"text": S, "space": SPACE}, ["text"]), WRITE, "capture", capture),
    "ask_confia": ("Ask MyConfía", "Answer a question from the person's own notes and to-dos (\"what did I note about pricing?\", \"what did Rohan promise?\"). Uses MyConfía's search over their saved notes.",
                   _schema({"question": S}, ["question"]), READ, "answer", ask_confia),
}

PROMPTS = {
    "plan_my_day": ("Plan my day", "Look at what's on and suggest a realistic plan.", "Open my Today in MyConfía, then suggest a realistic plan for the day: what to do first, what can wait, anything overdue to rescue. Keep it short."),
    "weekly_review": ("Weekly review", "Review the week across spaces.", "Look at my spaces and to-dos in MyConfía and give me a short weekly review: what moved, what is stuck, what is coming next week, and one thing to focus on."),
    "capture_meeting": ("Capture a meeting", "Turn what you tell me into notes and to-dos.", "I'll tell you about a meeting. Save it in MyConfía with the capture tool, then show me what was filed and the to-dos with dates."),
}


def view_of(name: str) -> Optional[str]:
    return TOOLS[name][4] if name in TOOLS else None


async def run(name: str, user_id: str, args: dict) -> dict:
    """Runs a tool. Returns {"text", "data"}; raises ToolError for a problem the person should hear about."""
    if name not in TOOLS:
        raise ToolError(f"Unknown tool: {name}")
    fn = TOOLS[name][5]
    try:
        if asyncio.iscoroutinefunction(fn):
            return await fn(user_id, args)
        return await run_in_threadpool(fn, user_id, args)
    except ToolError:
        raise
    except KeyError as e:
        raise ToolError(f"Missing: {e.args[0]}")
    except HTTPException as e:
        raise ToolError(str(e.detail))
