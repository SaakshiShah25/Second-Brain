"""
push_notify.py — Reminders as Web Push notifications. Three kinds:

  * The daily summary. At 9 AM and 5 PM in each user's own time zone every subscribed device
    gets one notification listing the user's open to-dos, grouped under their categories
    (initiatives). Entries in a list (a movie, a book) only appear once they have a date that
    has come. Tapping it opens the Today tab.
  * Task reminders: the bell on a task. The user picks a day and a time (default 9 AM; "at its due
    time" copies the task's own). It is sent once that moment has passed in the device's time zone.
  * Item reminders, one notification per item, at the moment it is for:
      - an item with a time of day: at that time ("Call the bank" at 4 PM)
      - a yearly date with no time (a birthday): 8 PM the evening before; the morning summary
        has it on the day itself
      - an "every N hours" routine (drink water): every N hours from 9 AM until 9 PM

How it runs
    A Supabase pg_cron job (scripts/migration_42_reminder_cron.sql, every minute) calls POST
    /api/push/send-due (.github/workflows/task-reminders.yml fires one tick by hand). send_due()
    works out each device's local time from the time zone it registered. Summaries go out when a
    device is inside a slot's window and that slot has not been sent today (last_9am / last_5pm
    hold the local date it last went out). A task reminder is marked sent in task.reminded_on and
    an item reminder records the occurrence it was sent for (task.reminded_key), so each goes out
    once; a missed minute is picked up on the next run, and a task reminder missed entirely is still
    delivered for REMINDER_GRACE_DAYS afterwards.

Setup (once): generate keys with `python scripts/generate_vapid_keys.py`, then set
VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: address) on the backend.
Without them nothing is sent and the app simply doesn't offer reminders.

Privacy: the push service (Google/Apple/Mozilla) relays the message but cannot read it - Web
Push payloads are end-to-end encrypted to the device. The text is built here from the user's
decrypted task descriptions, only at the moment of sending.
"""

import json
import os
from datetime import date, datetime, time, timedelta, timezone
from typing import Callable, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import date_utils
import db

# (slot name, hour of the day the reminder is for)
SLOTS = [("9am", 9), ("5pm", 17)]
# A slot stays open this long after its hour, so a delayed scheduler run still delivers it.
WINDOW_MINUTES = 90

MAX_GROUPS = 6            # categories shown
MAX_TASKS_PER_GROUP = 3   # task names shown under each
MAX_BODY_CHARS = 800
TASK_NAME_CHARS = 60

TASKS_URL = "/today"
PRIORITY_RANK = {"high": 0, "normal": 1, "low": 2}

# A task reminder (the bell on a task) goes out in the 9 AM window of the day it was set for. A run that was missed
# still delivers it for a few days afterwards.
CATEGORY_MARKS = ["🟦", "🟧", "🟩", "🟪", "🟥", "🟨", "🟫", "⬜"]

REMINDER_GRACE_DAYS = 3
# ...but never more than a day and a half late: a reminder for 9 AM on the 11th arriving on the 13th (say, because
# notifications were only switched on then) is noise, not help.
REMINDER_MAX_LATE = timedelta(hours=36)
DEFAULT_REMIND_TIME = "09:00"   # a reminder with no time of its own
MAX_REMINDER_LINES = 5

# An item reminder is still worth sending this long after its moment (a missed tick, the
# server waking up) - after that it is old news and the summary covers it.
ITEM_GRACE = timedelta(hours=2)
EVE_HOUR = 20                  # yearly dates (birthdays): the evening before
NUDGE_HOURS = (9, 21)          # "every N hours" routines run from 9 AM until 9 PM


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


def _minutes_of(hhmm, default_hour: int) -> int:
    """'07:30' -> 450; anything unreadable falls back to the slot's usual hour."""
    try:
        h, m = (int(x) for x in str(hhmm)[:5].split(":"))
        if 0 <= h < 24 and 0 <= m < 60:
            return h * 60 + m
    except (ValueError, TypeError):
        pass
    return default_hour * 60


def slot_times(sub: Optional[dict]) -> list:
    """[(slot, minute of the day)] for the summaries this device still wants, at the times it chose (default 9 AM and
    5 PM). The slot names stay '9am' and '5pm' - they are the keys the 'last sent' columns use - whatever the time."""
    sub = sub or {}
    out = []
    if sub.get("morning_on", True):
        out.append(("9am", _minutes_of(sub.get("morning_time"), 9)))
    if sub.get("evening_on", True):
        out.append(("5pm", _minutes_of(sub.get("evening_time"), 17)))
    return out


def due_slot(timezone_name: str, now_utc: Optional[datetime] = None, sub: Optional[dict] = None):
    """(slot, local_date_iso) when this device's local time is inside one of its summary windows, else
    None. `slot` is '9am' (the morning one) or '5pm' (the evening one), at the times the device chose."""
    local = _local_now(timezone_name, now_utc)
    minutes = local.hour * 60 + local.minute
    for slot, start in slot_times(sub):
        if start <= minutes < start + WINDOW_MINUTES:
            return slot, local.date().isoformat()
    return None


def for_device(sub: dict, message: dict) -> dict:
    """A reminder for one task, as this device wants it: alarm-style devices get `alarm` set, which the app turns into
    a full-screen card with sound and vibration. Summaries (no task_ids) are never alarms."""
    if sub.get("alarm_style") and message.get("task_ids"):
        return {**message, "alarm": True}
    return message


def _local_now(timezone_name: str, now_utc: Optional[datetime] = None) -> datetime:
    now_utc = now_utc or datetime.now(timezone.utc)
    try:
        return now_utc.astimezone(ZoneInfo(timezone_name))
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return now_utc  # unknown zone: treat as UTC rather than never sending


def _short(text: str) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= TASK_NAME_CHARS else text[: TASK_NAME_CHARS - 1].rstrip() + "…"


def group_open_tasks(user_id: str) -> list:
    """[(category name, [task descriptions])] - the user's categories in their listed order,
    "Others" (no category) last; nearest deadline first inside each, undated last."""
    today = date.today().isoformat()
    # A movie or a book on a list is a pile, not a to-do - only a list entry whose date has come
    # belongs in the summary.
    tasks = [t for t in db.get_all_tasks_with_context(user_id, status="open")
             if not t.get("list_id") or (t.get("due_date") and t["due_date"] <= today)]
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
    for n, (name, tasks) in enumerate(groups[:MAX_GROUPS]):
        shown = tasks[:MAX_TASKS_PER_GROUP]
        more = len(tasks) - len(shown)
        # A coloured square per category (a notification can't be coloured any other way) and a bullet per task.
        lines.append(f"{CATEGORY_MARKS[n % len(CATEGORY_MARKS)]} {name} · {len(tasks)}")
        lines += [f"   • {t}" for t in shown]
        if more:
            lines.append(f"   + {more} more")
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
            headers={"Urgency": "high"},  # delivered at once and allowed to make a sound, even in battery saver
        )
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status in (404, 410):
            raise SubscriptionGone() from e
        raise


def alarm_test_message(user_id: str) -> dict:
    """A sample alarm (the 'test alarm' button): the user's most important open task, so the full-screen card shows real
    content; with no tasks it is a plain test card."""
    tasks = [t for t in db.get_all_tasks_with_context(user_id, status="open") if not t.get("list_id")]
    tasks.sort(key=lambda t: (PRIORITY_RANK.get(t.get("priority"), 1), t.get("due_date") or "9999-12-31", t["id"]))
    top = tasks[0] if tasks else None
    return {
        "title": "Alarm test" + (f" · {_short(top['description'])}" if top else ""),
        "body": "This is how a reminder will ring.",
        "url": TASKS_URL,
        "tag": "alarm-test",
        "task_ids": [top["id"]] if top else [],
        "alarm": True,
        "test": True,
    }


def send_to_user(user_id: str, slot: str = "9am", sender: Optional[Callable] = None, alarm: bool = False) -> int:
    """Sends the current task list to every device of one user right now (the 'send me a test'
    button), or a sample alarm with alarm=True. Returns how many devices accepted it."""
    sender = sender or _send_webpush
    if alarm:
        message = alarm_test_message(user_id)
        sent = 0
        for sub in db.get_push_subscriptions(user_id):
            try:
                sender(sub, message)
                sent += 1
            except SubscriptionGone:
                db.delete_push_subscription(sub["endpoint"])
            except Exception as e:
                print(f"[warn] alarm test to {sub['endpoint'][:48]}… failed: {e}")
        return sent
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
    return datetime.combine(date.fromisoformat(str(task["remind_on"])[:10]), time(hour, minute))


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
        "task_ids": [t["id"] for t in ordered],
    }


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
            now_local = local.replace(tzinfo=None)
            tasks = [t for t in db.get_tasks_to_remind(user_id, local_date, since)
                     if reminder_moment(t) <= now_local and now_local - reminder_moment(t) <= REMINDER_MAX_LATE]
        except Exception as e:
            print(f"[warn] couldn't read task reminders for {user_id}: {e}")
            continue
        message = build_reminder_message(tasks, local_date)
        if message is None:
            continue
        delivered = False
        for sub in subs:
            try:
                sender(sub, for_device(sub, message))
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


def before_label(minutes: int) -> str:
    """30 -> "In 30 minutes", 60 -> "In 1 hour", 1440 -> "Tomorrow", 2880 -> "In 2 days"."""
    if minutes >= 1440 and minutes % 1440 == 0:
        days = minutes // 1440
        return "Tomorrow" if days == 1 else f"In {days} days"
    if minutes >= 60 and minutes % 60 == 0:
        hours = minutes // 60
        return "In 1 hour" if hours == 1 else f"In {hours} hours"
    return f"In {minutes} minutes"


def item_reminder(item: dict, timezone_name: str, now_utc: Optional[datetime] = None):
    """(occurrence key, message) when this item's own reminder is due now and hasn't been sent
    for this occurrence yet, else None. See the module docstring for when each kind fires."""
    before = item.get("remind_before")
    if not item.get("due_date") or (item.get("remind_on") and not before):
        return None  # (an item with a bell set is reminded by that, once - see send_task_reminders)
    local = _local_now(timezone_name, now_utc)
    now = local.replace(tzinfo=None)
    due = date.fromisoformat(item["due_date"])
    lst = item.get("item_list") or {}
    title = f"{lst['emoji']} {item['description']}" if lst.get("emoji") else item["description"]
    hours = date_utils.repeat_hours(item.get("repeat"))

    if before and not hours:
        # "Remind me 30 minutes before": counted from the due time, or from 9 AM on the due date when it has none.
        hh, mm = (int(x) for x in str(item.get("due_time") or f"{DEFAULT_REMIND_TIME}").split(":")[:2])
        at = datetime.combine(due, time(hh, mm))
        fire = at - timedelta(minutes=int(before))
        if not (fire <= now < fire + ITEM_GRACE):
            return None
        key = f"before:{at.strftime('%Y-%m-%dT%H:%M')}:{int(before)}"
        body = f"{before_label(int(before))} · {at.strftime('%-I:%M %p') if item.get('due_time') else due.strftime('%a %-d %b')}"
    elif hours:
        start, end = NUDGE_HOURS
        if due > now.date() or not (start <= now.hour < end):
            return None
        slot = start + (now.hour - start) // hours * hours
        key, body = f"{now.date().isoformat()}T{slot:02d}", "Time for this again"
    elif item.get("due_time"):
        hh, mm = (int(x) for x in str(item["due_time"]).split(":")[:2])
        at = datetime.combine(due, time(hh, mm))
        if not (at <= now < at + ITEM_GRACE):
            return None
        key, body = at.strftime("%Y-%m-%dT%H:%M"), f"Now · {lst.get('name') or 'Tasks'}"
    elif item.get("repeat") == "yearly":
        at = datetime.combine(due - timedelta(days=1), time(EVE_HOUR))
        if not (at <= now < at + ITEM_GRACE):
            return None
        key, body = f"eve:{due.isoformat()}", "Tomorrow"
    else:
        return None
    if item.get("reminded_key") == key:
        return None
    return key, {"title": title, "body": body, "url": TASKS_URL, "tag": f"item-{item['id']}",
                 # an "every N hours" nudge is a gentle notification, never a full-screen alarm
                 **({} if hours else {"task_ids": [item["id"]]})}


def _send_item_reminders(subs: list, now_utc: Optional[datetime], sender: Callable, result: dict) -> None:
    by_user: dict = {}
    for sub in subs:
        by_user.setdefault(sub["user_id"], []).append(sub)
    until = ((now_utc or datetime.now(timezone.utc)) + timedelta(days=3)).date().isoformat()
    try:
        items = db.get_reminder_candidates(list(by_user), until)
    except Exception as e:
        print(f"[warn] couldn't read item reminders (run scripts/migration_40_lists.sql?): {e}")
        return
    for item in items:
        devices = by_user.get(item["user_id"]) or []
        due = item_reminder(item, devices[0].get("timezone") or "UTC", now_utc) if devices else None
        if not due:
            continue
        key, message = due
        delivered = False
        for sub in devices:
            try:
                sender(sub, for_device(sub, message))
                delivered = True
            except SubscriptionGone:
                db.delete_push_subscription(sub["endpoint"])
                result["removed"] += 1
            except Exception as e:
                print(f"[warn] push to {sub['endpoint'][:48]}… failed: {e}")
                result["failed"] += 1
        if delivered:
            db.mark_task_reminded(item["id"], key)
            result["items_sent"] += 1


def send_due(now_utc: Optional[datetime] = None, sender: Optional[Callable] = None) -> dict:
    """One scheduler tick: sends every summary and item reminder that is due and not yet sent.
    Returns counts for the job's log."""
    sender = sender or _send_webpush
    result = {"checked": 0, "due": 0, "sent": 0, "skipped_no_tasks": 0, "removed": 0, "failed": 0, "items_sent": 0}
    subs = db.get_push_subscriptions()
    _send_item_reminders(subs, now_utc, sender, result)
    messages: dict = {}  # (user_id, slot) -> message, built once per user per tick
    for sub in subs:
        result["checked"] += 1
        due = due_slot(sub.get("timezone") or "UTC", now_utc, sub)
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
