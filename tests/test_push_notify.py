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
    assert msg["title"] == "Good morning · 7 open tasks" and msg["url"] == "/tasks"
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
    push.push_notify = types.SimpleNamespace(configured=lambda: True, send_due=lambda: {"sent": 0})
    for bad in (None, "", "wrong"):
        try:
            push.send_due(bad)
            assert False, bad
        except Exception as e:
            assert getattr(e, "status_code", None) == 403
    assert push.send_due("s3cret") == {"sent": 0}


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
