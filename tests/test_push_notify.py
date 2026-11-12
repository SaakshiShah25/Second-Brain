"""Task reminders: when a device is due, what the message says, and the send loop.
Run: python tests/test_push_notify.py"""

import os
import sys
import types
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import push_notify as pn  # noqa: E402


def utc(h, m=0, day=28):
    return datetime(2026, 10, day, h, m, tzinfo=timezone.utc)


def test_a_device_is_due_at_nine_and_five_in_its_own_time_zone():
    # 03:30 UTC is 09:00 in Kolkata (UTC+5:30)
    assert pn.due_slot("Asia/Kolkata", utc(3, 30)) == ("9am", "2026-10-28")
    assert pn.due_slot("Asia/Kolkata", utc(3, 29)) is None            # a minute early
    assert pn.due_slot("Asia/Kolkata", utc(4, 45)) == ("9am", "2026-10-28")   # still inside the window
    assert pn.due_slot("Asia/Kolkata", utc(5, 0)) is None             # window closed (10:30 local)
    assert pn.due_slot("Asia/Kolkata", utc(11, 30)) == ("5pm", "2026-10-28")
    # New York is UTC-4 on 28 Oct 2026: 5 PM there is 21:00 UTC, and the local DATE is still the 28th
    assert pn.due_slot("America/New_York", utc(21, 10)) == ("5pm", "2026-10-28")
    # the local date can differ from the UTC date: 9 AM in Auckland (UTC+13) on the 29th is 20:00 UTC on the 28th
    assert pn.due_slot("Pacific/Auckland", utc(20, 10)) == ("9am", "2026-10-29")
    # a zone that does not exist falls back to UTC instead of never sending
    assert pn.due_slot("Not/AZone", utc(9, 5)) == ("9am", "2026-10-28")


def test_timezone_names_are_validated():
    assert pn.valid_timezone("Asia/Kolkata") and pn.valid_timezone("UTC")
    assert not pn.valid_timezone("nonsense") and not pn.valid_timezone("")


def _tasks():
    def t(id, desc, due, ini):
        return {"id": id, "description": desc, "due_date": due, "due_time": None, "status": "open",
                "interaction": {"initiative": {"id": ini, "name": "x"} if ini else None}}
    return [t(1, "Send Priya the deck", "2026-10-30", 1), t(2, "Email the proposal", "2026-10-28", 1),
            t(3, "Book dentist", None, 2), t(4, "Order a notebook", None, None), t(5, "Pay rent", "2026-10-29", 2),
            t(6, "Fourth work task", "2026-11-05", 1), t(7, "Fifth work task", "2026-11-06", 1)]


def _db(tasks=None, subs=None, log=None):
    tasks = _tasks() if tasks is None else tasks
    log = log if log is not None else {"sent": [], "deleted": []}
    return types.SimpleNamespace(
        get_all_tasks_with_context=lambda uid, status=None: tasks,
        get_initiatives=lambda uid: [{"id": 1, "name": "Work"}, {"id": 2, "name": "Personal"}],
        get_push_subscriptions=lambda uid=None: [s for s in (subs or []) if not uid or s["user_id"] == uid],
        mark_push_sent=lambda sid, slot, d: log["sent"].append((sid, slot, d)),
        delete_push_subscription=lambda endpoint, user_id=None: log["deleted"].append(endpoint),
    ), log


def test_tasks_are_grouped_under_categories_nearest_deadline_first():
    pn.db, _ = _db()
    groups = pn.group_open_tasks("u")
    assert [g[0] for g in groups] == ["Work", "Personal", "Others"]
    assert groups[0][1][:2] == ["Email the proposal", "Send Priya the deck"]     # due 28th, then 30th
    assert groups[1][1] == ["Pay rent", "Book dentist"]                          # dated before undated


def test_the_message_lists_each_category_with_a_few_tasks_and_a_count():
    pn.db, _ = _db()
    msg = pn.build_message(pn.group_open_tasks("u"), "9am")
    assert msg["title"] == "Good morning · 7 open tasks" and msg["url"] == "/today"
    lines = msg["body"].split("\n")
    assert lines[0].startswith("Work (4): Email the proposal · Send Priya the deck · Fourth work task +1 more")
    assert lines[1] == "Personal (2): Pay rent · Book dentist" and lines[2] == "Others (1): Order a notebook"
    assert pn.build_message(pn.group_open_tasks("u"), "5pm")["title"].startswith("Evening check-in")
    assert pn.build_message([], "9am") is None


def test_a_long_task_name_is_shortened():
    assert len(pn._short("word " * 40)) <= pn.TASK_NAME_CHARS and pn._short("  short   task ") == "short task"


def _sub(id, endpoint, tz="Asia/Kolkata", user="u1", **last):
    return {"id": id, "user_id": user, "endpoint": endpoint, "p256dh": "k", "auth": "a", "timezone": tz, **last}


def test_send_due_sends_once_per_slot_and_remembers_it():
    subs = [_sub(1, "https://push/a"), _sub(2, "https://push/b", last_9am="2026-10-28"),
            _sub(3, "https://push/c", tz="America/New_York")]
    pn.db, log = _db(subs=subs)
    delivered = []
    out = pn.send_due(utc(3, 40), sender=lambda sub, msg: delivered.append((sub["id"], msg["tag"])))
    # 1: due now. 2: already got today's 9 AM. 3: it is 23:40 the evening before in New York - not due.
    assert delivered == [(1, "tasks-9am")] and log["sent"] == [(1, "9am", "2026-10-28")]
    assert out["sent"] == 1 and out["checked"] == 3 and out["due"] == 1


def test_two_devices_of_one_user_share_one_message_and_both_get_it():
    subs = [_sub(1, "https://push/a"), _sub(2, "https://push/b")]
    pn.db, log = _db(subs=subs)
    delivered = []
    out = pn.send_due(utc(11, 40), sender=lambda sub, msg: delivered.append(sub["id"]))
    assert delivered == [1, 2] and out["sent"] == 2 and {s[1] for s in log["sent"]} == {"5pm"}


def test_nothing_is_sent_when_there_are_no_open_tasks_and_it_is_not_marked_sent():
    pn.db, log = _db(tasks=[], subs=[_sub(1, "https://push/a")])
    delivered = []
    out = pn.send_due(utc(3, 40), sender=lambda sub, msg: delivered.append(1))
    assert delivered == [] and log["sent"] == [] and out["skipped_no_tasks"] == 1


def test_a_device_that_is_gone_is_removed_and_a_failure_is_not_marked_sent():
    subs = [_sub(1, "https://push/gone"), _sub(2, "https://push/flaky")]
    pn.db, log = _db(subs=subs)

    def sender(sub, msg):
        if sub["id"] == 1:
            raise pn.SubscriptionGone()
        raise RuntimeError("push service down")

    out = pn.send_due(utc(3, 40), sender=sender)
    assert log["deleted"] == ["https://push/gone"] and log["sent"] == []
    assert out["removed"] == 1 and out["failed"] == 1 and out["sent"] == 0


def test_send_to_user_reports_how_many_devices_got_the_test():
    subs = [_sub(1, "https://push/a"), _sub(2, "https://push/b", user="someone-else")]
    pn.db, _ = _db(subs=subs)
    got = []
    assert pn.send_to_user("u1", sender=lambda sub, msg: got.append(sub["id"])) == 1 and got == [1]


def test_the_cron_endpoint_needs_the_shared_secret():
    import api.routers.push as push
    os.environ["CRON_SECRET"] = "s3cret"
    os.environ["VAPID_PUBLIC_KEY"] = "pub"
    os.environ["VAPID_PRIVATE_KEY"] = "priv"
    push.push_notify = types.SimpleNamespace(configured=lambda: True, send_due=lambda: {"sent": 0},
                                             send_task_reminders=lambda: {"reminded_tasks": 0})
    for bad in (None, "", "wrong"):
        try:
            push.send_due(bad)
            assert False, bad
        except Exception as e:
            assert getattr(e, "status_code", None) == 403
    assert push.send_due("s3cret") == {"sent": 0, "reminded_tasks": 0}


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn(); print(f"  ok   {name}")
        except Exception as e:  # noqa: BLE001
            failed += 1; print(f"  FAIL {name}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)


def test_a_task_you_marked_high_leads_its_category_and_a_moved_task_is_listed_under_its_new_category():
    def t(id, desc, ini, priority, due=None, own=True):
        row = {"id": id, "description": desc, "due_date": due, "due_time": None, "status": "open", "priority": priority,
               "interaction": {"initiative": {"id": 1, "name": "x"}}}
        if own:
            row["initiative_id"] = ini
        return row
    # task 3 was written under Work (the note's category) but moved to Personal; task 1 is high but dated later
    tasks = [t(1, "Plan the launch", 1, "high", "2026-11-09"), t(2, "Send the invoice", 1, "normal", "2026-11-02"),
             t(3, "Book dentist", 2, "normal")]
    pn.db, _ = _db(tasks=tasks)
    groups = pn.group_open_tasks("u")
    assert groups == [("Work", ["Plan the launch", "Send the invoice"]), ("Personal", ["Book dentist"])]


def _reminder_world(tasks):
    """A db stand-in holding task reminders; marking one removes it from what is still pending."""
    sent, marked = [], []
    subs = [{"id": 1, "user_id": "u", "endpoint": "e1", "timezone": "Asia/Kolkata"},
            {"id": 2, "user_id": "u", "endpoint": "e2", "timezone": "Asia/Kolkata"}]
    pending = {t["id"]: t for t in tasks}

    def mark(ids, d):
        marked.append((ids, d))
        for i in ids:
            pending.pop(i, None)

    pn.db = types.SimpleNamespace(
        get_push_subscriptions=lambda uid=None: subs,
        get_users_with_reminders=lambda today, since: {"u"} if pending else set(),
        get_tasks_to_remind=lambda uid, today, since: [t for t in pending.values() if since <= t["remind_on"] <= today],
        mark_tasks_reminded=mark,
        delete_push_subscription=lambda *a, **k: None,
    )
    return sent, marked, (lambda sub, msg: sent.append((sub["endpoint"], msg)))


def test_a_task_reminder_goes_out_once_its_own_time_has_passed_in_the_users_time_zone():
    tasks = [{"id": 7, "description": "Renew passport", "due_date": "2026-11-10", "priority": "high", "remind_on": "2026-10-28"},
             {"id": 8, "description": "Call the bank", "due_date": None, "remind_on": "2026-10-28", "remind_time": "15:00:00"},
             {"id": 9, "description": "Pay rent", "due_date": None, "remind_on": "2026-10-27"}]   # missed yesterday
    sent, marked, sender = _reminder_world(tasks)
    # 09:10 in Kolkata on 28 Oct: the two with no time (9 AM) are due, the 3 PM one is not yet
    out = pn.send_task_reminders(now_utc=utc(3, 40), sender=sender)
    assert out == {"reminded_users": 1, "reminded_tasks": 2}
    assert [e for e, _ in sent] == ["e1", "e2"]              # every device of the user
    msg = sent[0][1]
    assert msg["title"] == "Reminder · 2 tasks" and "Renew passport (due 2026-11-10)" in msg["body"] and "Call the bank" not in msg["body"]
    assert marked == [([7, 9], "2026-10-28")]
    # a run a few minutes later has nothing new to say
    sent.clear()
    assert pn.send_task_reminders(now_utc=utc(3, 45), sender=sender)["reminded_tasks"] == 0 and sent == []
    # 15:30 in Kolkata: now the 3 PM one goes, on its own notification tag
    out = pn.send_task_reminders(now_utc=utc(10, 0), sender=sender)
    assert out["reminded_tasks"] == 1 and sent[0][1]["title"] == "Reminder · Call the bank"
    assert sent[0][1]["tag"] == "task-reminder-8" and marked[-1] == ([8], "2026-10-28")


def test_nothing_is_sent_before_a_reminders_time_and_a_failed_send_is_retried():
    sent, marked, sender = _reminder_world([{"id": 1, "description": "Call mom", "remind_on": "2026-10-28", "remind_time": "18:30"}])
    assert pn.send_task_reminders(now_utc=utc(3, 40), sender=sender)["reminded_tasks"] == 0 and sent == [] and marked == []
    boom = lambda s, m: (_ for _ in ()).throw(RuntimeError("down"))
    assert pn.send_task_reminders(now_utc=utc(13, 0), sender=boom)["reminded_tasks"] == 0 and marked == []   # 18:30 IST
    assert pn.send_task_reminders(now_utc=utc(13, 5), sender=sender)["reminded_tasks"] == 1                  # tried again


def test_a_run_with_nothing_pending_reads_the_tasks_once_not_per_user():
    reads = []
    pn.db = types.SimpleNamespace(
        get_push_subscriptions=lambda uid=None: [{"id": 1, "user_id": "u", "endpoint": "e", "timezone": "UTC"}],
        get_users_with_reminders=lambda today, since: set(),
        get_tasks_to_remind=lambda *a: reads.append(a) or [],
    )
    assert pn.send_task_reminders(now_utc=utc(9, 0), sender=lambda s, m: None) == {"reminded_users": 0, "reminded_tasks": 0}
    assert reads == []


def test_a_single_reminder_is_titled_with_the_task_and_shows_the_due_time():
    msg = pn.build_reminder_message([{"id": 1, "description": "Renew passport", "due_date": None}], "2026-10-28")
    assert msg["title"] == "Reminder · Renew passport" and msg["tag"] == "task-reminder-1"
    two = pn.build_reminder_message([{"id": 1, "description": "A", "due_date": "2026-10-30", "due_time": "18:00:00"},
                                     {"id": 2, "description": "B", "due_date": None}], "2026-10-28")
    assert "A (due 2026-10-30 at 18:00)" in two["body"]
    assert pn.build_reminder_message([], "2026-10-28") is None


# ---- a device can pick when its summaries arrive, and make reminders ring like an alarm ----

def test_a_device_can_move_or_switch_off_its_summaries():
    early = {"morning_time": "07:30", "evening_on": False}
    assert pn.due_slot("Asia/Kolkata", utc(2, 0), early) == ("9am", "2026-10-28")      # 07:30 local: the morning slot, at 07:30
    assert pn.due_slot("Asia/Kolkata", utc(1, 59), early) is None                       # a minute before it
    assert pn.due_slot("Asia/Kolkata", utc(3, 30), early) is None                       # 9 AM is no longer a slot for this device
    assert pn.due_slot("Asia/Kolkata", utc(11, 30), early) is None                      # evening switched off
    late = {"evening_time": "21:15"}
    assert pn.due_slot("Asia/Kolkata", utc(15, 45), late) == ("5pm", "2026-10-28")      # 21:15 local
    assert pn.due_slot("Asia/Kolkata", utc(3, 30), None) == ("9am", "2026-10-28")       # no preferences: 9 AM as always
    assert pn.slot_times({"morning_time": "garbage"}) == [("9am", 540), ("5pm", 1020)]  # unreadable falls back to the usual


def test_alarm_style_devices_get_alarms_for_task_reminders_only():
    reminder = {"title": "Reminder", "body": "x", "task_ids": [7]}
    assert pn.for_device({"alarm_style": True}, reminder)["alarm"] is True
    assert "alarm" not in pn.for_device({"alarm_style": False}, reminder)
    assert "alarm" not in pn.for_device({"alarm_style": True}, {"title": "Good morning", "body": "x"})   # a summary is never an alarm
    assert "alarm" not in pn.for_device({}, reminder)
