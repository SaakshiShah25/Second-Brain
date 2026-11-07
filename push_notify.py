"""
push_notify.py — Task reminders as Web Push notifications.

Two kinds of notification:
  * The daily summary: at 9 AM and 5 PM in each user's own time zone every subscribed device gets
    one notification listing the user's open tasks, grouped under their categories (initiatives), so
    they can see at a glance what to focus on.
  * Task reminders: the bell on a task. The user picks a day and a time (default 9 AM; "at its due
    time" copies the task's own). It is sent once that moment has passed in the device's time zone.
Tapping either opens the Tasks tab.

How it runs
    A Supabase pg_cron job (scripts/migration_42_reminder_cron.sql, every minute) calls POST
    /api/push/send-due (.github/workflows/task-reminders.yml fires one tick by hand). send_due() looks at each stored device, works out its local time from the
    time zone it registered, and sends a summary when it is inside a slot's window and that slot has
    not been sent today (last_9am / last_5pm hold the local date it last went out). Task reminders
    are sent by send_task_reminders() on the first run at or after their moment and marked
    (task.reminded_on), so a late or skipped run only delays them - and a reminder missed entirely is
    still delivered for REMINDER_GRACE_DAYS afterwards.

Setup (once): generate keys with `python scripts/generate_vapid_keys.py`, then set
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: address) on the backend.
Without them nothing is sent and the app simply doesn't offer reminders.

Privacy: the push service (Google/Apple/Mozilla) relays the message but cannot read it - Web
Push payloads are end-to-end encrypted to the device. The text is built here from the user's
decrypted task descriptions, only at the moment of sending.
"""

import json
import os
from datetime import date, datetime, timedelta, timezone
from datetime import time as dtime
from typing import Callable, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import db

# (slot name, hour of the day the reminder is for)
SLOTS = [("9am", 9), ("5pm", 17)]
# A slot stays open this long after its hour, so a delayed scheduler run still delivers it.
WINDOW_MINUTES = 90

MAX_GROUPS = 6            # categories shown
MAX_TASKS_PER_GROUP = 3   # task names shown under each
MAX_BODY_CHARS = 480
TASK_NAME_CHARS = 60

TASKS_URL = "/tasks"
PRIORITY_RANK = {"high": 0, "normal": 1, "low": 2}

# A task reminder (the bell on a task) goes out in the 9 AM window of the day it was set for. A run that was missed
# still delivers it for a few days afterwards.
REMINDER_GRACE_DAYS = 3
DEFAULT_REMIND_TIME = "09:00"   # a reminder with no time of its own
MAX_REMINDER_LINES = 5


def configured() -> bool:
    return bool(os.environ.get("VAPID_PUBLIC_KEY") and os.environ.get("VAPID_PRIVATE_KEY"))


def public_key() -> Optional[str]:
    return os.environ.get("VAPID_PUBLIC_KEY") or None


def valid_timezone(name: str) -> bool:
    try:
        ZoneInfo(name)
        return True
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return False


def due_slot(timezone_name: str, now_utc: Optional[datetime] = None):
    """(slot, local_date_iso) when this device's local time is inside a reminder window, else
    None. `slot` is '9am' or '5pm'."""
    now_utc = now_utc or datetime.now(timezone.utc)
    try:
        local = now_utc.astimezone(ZoneInfo(timezone_name))
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        local = now_utc  # unknown zone: treat as UTC rather than never sending
    minutes = local.hour * 60 + local.minute
    for slot, hour in SLOTS:
        if hour * 60 <= minutes < hour * 60 + WINDOW_MINUTES:
            return slot, local.date().isoformat()
    return None


def _short(text: str) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= TASK_NAME_CHARS else text[: TASK_NAME_CHARS - 1].rstrip() + "…"


def group_open_tasks(user_id: str) -> list:
    """[(category name, [task descriptions])] - the user's categories in their listed order,
    "Others" (no category) last; nearest deadline first inside each, undated last."""
    tasks = db.get_all_tasks_with_context(user_id, status="open")
    initiatives = db.get_initiatives(user_id)
    by_id = {i["id"]: i["name"] for i in initiatives}

    def key(t):
        # what you marked high first, then the nearest deadline, undated last
        return (PRIORITY_RANK.get(t.get("priority"), 1), t.get("due_date") or "9999-12-31", str(t.get("due_time") or "99"), t["id"])

    def initiative_id(t):
        # the task's own category when it has one (it can be moved), else its note's
        if "initiative_id" in t:
            return t["initiative_id"]
        return ((t.get("interaction") or {}).get("initiative") or {}).get("id")

    buckets: dict = {}
    for t in sorted(tasks, key=key):
        ini_id = initiative_id(t)
        name = by_id.get(ini_id) if ini_id in by_id else None
        buckets.setdefault(name, []).append(_short(t["description"]))
    ordered = [(i["name"], buckets[i["name"]]) for i in initiatives if i["name"] in buckets]
    if None in buckets:
        ordered.append(("Others", buckets[None]))
    return ordered


def build_message(groups: list, slot: str) -> Optional[dict]:
    """The notification (title, body, url, tag) for `groups`, or None when there is nothing open."""
    total = sum(len(tasks) for _, tasks in groups)
    if total == 0:
        return None
    lines = []
    for name, tasks in groups[:MAX_GROUPS]:
        shown = tasks[:MAX_TASKS_PER_GROUP]
        more = len(tasks) - len(shown)
        lines.append(f"{name} ({len(tasks)}): " + " · ".join(shown) + (f" +{more} more" if more else ""))
    hidden = len(groups) - MAX_GROUPS
    if hidden > 0:
        lines.append(f"+{hidden} more categories")
    body = "\n".join(lines)
    if len(body) > MAX_BODY_CHARS:
        body = body[: MAX_BODY_CHARS - 1].rstrip() + "…"
    greeting = "Good morning" if slot == "9am" else "Evening check-in"
    return {
        "title": f"{greeting} · {total} open task{'s' if total != 1 else ''}",
        "body": body,
        "url": TASKS_URL,
        "tag": f"tasks-{slot}",  # a newer reminder replaces an unread one instead of stacking
    }


class SubscriptionGone(Exception):
    """The push service says this device will never accept messages again (uninstalled / revoked)."""


def _send_webpush(subscription: dict, message: dict) -> None:
    from pywebpush import WebPushException, webpush  # imported here: only needed when sending

    try:
        webpush(
            subscription_info={"endpoint": subscription["endpoint"],
                               "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]}},
            data=json.dumps(message),
            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
            vapid_claims={"sub": os.environ.get("VAPID_SUBJECT", "mailto:admin@example.com")},
            ttl=6 * 3600,  # a reminder that is hours old is worth less than none
        )
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status in (404, 410):
            raise SubscriptionGone() from e
        raise


def send_to_user(user_id: str, slot: str = "9am", sender: Optional[Callable] = None) -> int:
    """Sends the current task list to every device of one user right now (the 'send me a test'
    button). Returns how many devices accepted it."""
    sender = sender or _send_webpush
    message = build_message(group_open_tasks(user_id), slot) or {
        "title": "Nothing open right now", "body": "You have no open tasks. Nice.", "url": TASKS_URL, "tag": "tasks-test",
    }
    sent = 0
    for sub in db.get_push_subscriptions(user_id):
        try:
            sender(sub, message)
            sent += 1
        except SubscriptionGone:
            db.delete_push_subscription(sub["endpoint"])
        except Exception as e:
            print(f"[warn] push to {sub['endpoint'][:48]}… failed: {e}")
    return sent


def reminder_moment(task: dict) -> datetime:
    """When this task's reminder is for, as a naive local time: its day at its time (9 AM when it has none)."""
    hhmm = str(task.get("remind_time") or DEFAULT_REMIND_TIME)[:5]
    hour, minute = (int(x) for x in hhmm.split(":"))
    return datetime.combine(date.fromisoformat(str(task["remind_on"])[:10]), dtime(hour, minute))


def build_reminder_message(tasks: list, local_date: str) -> Optional[dict]:
    """The notification for tasks the user asked to be reminded about, or None when there are none."""
    if not tasks:
        return None
    ordered = sorted(tasks, key=lambda t: (PRIORITY_RANK.get(t.get("priority"), 1), t.get("due_date") or "9999-12-31", t["id"]))
    def line(t):
        due = f" (due {t['due_date']}" + (f" at {str(t['due_time'])[:5]}" if t.get("due_time") else "") + ")" if t.get("due_date") else ""
        return _short(t["description"]) + due
    lines = [line(t) for t in ordered[:MAX_REMINDER_LINES]]
    if len(ordered) > MAX_REMINDER_LINES:
        lines.append(f"+{len(ordered) - MAX_REMINDER_LINES} more")
    one = len(ordered) == 1
    return {
        "title": "Reminder · " + (_short(ordered[0]["description"]) if one else f"{len(ordered)} tasks"),
        "body": "\n".join(lines) if not one else (f"Due {ordered[0]['due_date']}" if ordered[0].get("due_date") else "You asked to be reminded."),
        "url": TASKS_URL,
        # one tag per reminder, so a 9 AM and a 3 PM reminder on the same day don't replace each other
        "tag": f"task-reminder-{ordered[0]['id']}",
    }


def _local_now(timezone_name: str, now_utc: datetime) -> datetime:
    try:
        return now_utc.astimezone(ZoneInfo(timezone_name))
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return now_utc  # unknown zone: treat as UTC rather than never sending


def send_task_reminders(now_utc: Optional[datetime] = None, sender: Optional[Callable] = None) -> dict:
    """Sends the reminders users set on individual tasks (the bell). One notification per user per run, to each of
    their devices, listing the tasks whose moment (their day and time, in the user's time zone) has passed; each task
    is reminded once."""
    sender = sender or _send_webpush
    result = {"reminded_users": 0, "reminded_tasks": 0}
    now_utc = now_utc or datetime.now(timezone.utc)
    by_user: dict = {}
    for sub in db.get_push_subscriptions():
        by_user.setdefault(sub["user_id"], []).append(sub)
    if not by_user:
        return result
    # One query for who has anything pending at all (time zones span a day either side of UTC), so a run with
    # nothing to send costs a single read rather than one per user.
    try:
        waiting = db.get_users_with_reminders(
            (now_utc.date() + timedelta(days=1)).isoformat(),
            (now_utc.date() - timedelta(days=REMINDER_GRACE_DAYS + 1)).isoformat(),
        )
    except Exception as e:
        print(f"[warn] couldn't read task reminders: {e}")
        return result
    for user_id, subs in by_user.items():
        if user_id not in waiting:
            continue
        local = _local_now(subs[0].get("timezone") or "UTC", now_utc)
        local_date = local.date().isoformat()
        since = (local.date() - timedelta(days=REMINDER_GRACE_DAYS)).isoformat()
        try:
            tasks = [t for t in db.get_tasks_to_remind(user_id, local_date, since)
                     if reminder_moment(t) <= local.replace(tzinfo=None)]
        except Exception as e:
            print(f"[warn] couldn't read task reminders for {user_id}: {e}")
            continue
        message = build_reminder_message(tasks, local_date)
        if message is None:
            continue
        delivered = False
        for sub in subs:
            try:
                sender(sub, message)
                delivered = True
            except SubscriptionGone:
                db.delete_push_subscription(sub["endpoint"])
            except Exception as e:
                print(f"[warn] reminder push to {sub['endpoint'][:48]}… failed: {e}")
        if delivered:
            db.mark_tasks_reminded([t["id"] for t in tasks], local_date)
            result["reminded_users"] += 1
            result["reminded_tasks"] += len(tasks)
    return result


def send_due(now_utc: Optional[datetime] = None, sender: Optional[Callable] = None) -> dict:
    """One scheduler tick: sends every reminder that is due and not yet sent today.
    Returns counts for the job's log."""
    sender = sender or _send_webpush
    result = {"checked": 0, "due": 0, "sent": 0, "skipped_no_tasks": 0, "removed": 0, "failed": 0}
    messages: dict = {}  # (user_id, slot) -> message, built once per user per tick
    for sub in db.get_push_subscriptions():
        result["checked"] += 1
        due = due_slot(sub.get("timezone") or "UTC", now_utc)
        if not due:
            continue
        slot, local_date = due
        if sub.get(f"last_{slot}") == local_date:
            continue  # already sent in this slot today
        result["due"] += 1
        key = (sub["user_id"], slot)
        if key not in messages:
            try:
                messages[key] = build_message(group_open_tasks(sub["user_id"]), slot)
            except Exception as e:
                print(f"[warn] couldn't build the task reminder for {sub['user_id']}: {e}")
                messages[key] = None
                result["failed"] += 1
                continue
        message = messages[key]
        if message is None:
            result["skipped_no_tasks"] += 1  # not marked sent: a task added later in the window still gets its reminder
            continue
        try:
            sender(sub, message)
            db.mark_push_sent(sub["id"], slot, local_date)
            result["sent"] += 1
        except SubscriptionGone:
            db.delete_push_subscription(sub["endpoint"])
            result["removed"] += 1
        except Exception as e:
            print(f"[warn] push to {sub['endpoint'][:48]}… failed: {e}")
            result["failed"] += 1
    return result
