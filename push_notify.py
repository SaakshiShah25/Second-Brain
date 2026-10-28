"""
push_notify.py — Task reminders as Web Push notifications.

Twice a day (9 AM and 5 PM in each user's own time zone) every subscribed device gets one
notification listing the user's open tasks, grouped under their categories (initiatives), so
they can see at a glance what to focus on. Tapping it opens the Tasks tab.

How it runs
    A scheduled job (.github/workflows/task-reminders.yml) calls POST /api/push/send-due every
    30 minutes. send_due() looks at each stored device, works out its local time from the
    time zone it registered, and sends when it is inside a slot's window and that slot has not
    been sent today (last_9am / last_5pm hold the local date it last went out). A late or
    skipped run is fine: the window stays open for a while, and it can only send once a slot.

Setup (once): generate keys with `python scripts/generate_vapid_keys.py`, then set
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: address) on the backend.
Without them nothing is sent and the app simply doesn't offer reminders.

Privacy: the push service (Google/Apple/Mozilla) relays the message but cannot read it - Web
Push payloads are end-to-end encrypted to the device. The text is built here from the user's
decrypted task descriptions, only at the moment of sending.
"""

import json
import os
from datetime import datetime, timezone
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
        return (t.get("due_date") or "9999-12-31", str(t.get("due_time") or "99"), t["id"])

    buckets: dict = {}
    for t in sorted(tasks, key=key):
        ini = (t.get("interaction") or {}).get("initiative") or {}
        name = by_id.get(ini.get("id")) if ini.get("id") in by_id else None
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
