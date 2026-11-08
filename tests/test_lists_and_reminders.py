"""Lists, repeating items and per-item reminders: capture routing (items with no note, list
entries), repeat dates, and when an item's own push reminder fires.
Run: python tests/test_lists_and_reminders.py"""

import os
import sys
import types
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import date_utils as du  # noqa: E402
import push_notify as pn  # noqa: E402


def test_repeat_wording_is_normalised_or_dropped():
    cases = {"daily": "daily", "Every night": "daily", "every weekday": "weekdays", "every week": "weekly",
             "annually": "yearly", "every 2 hours": "hours:2", "hourly": "hours:1", "hours:3": "hours:3"}
    for raw, expected in cases.items():
        assert du.normalize_repeat(raw) == expected, raw
    for bad in ["sometimes", "every 30 hours", "", None, 5]:
        assert du.normalize_repeat(bad) is None, bad


def test_a_new_repeating_item_starts_at_its_next_occurrence():
    mon = date(2026, 11, 2)
    assert du.first_occurrence("2026-03-14", "yearly", mon) == "2027-03-14"   # a birthday that has passed this year
    assert du.first_occurrence("2026-12-25", "yearly", mon) == "2026-12-25"
    assert du.first_occurrence("2026-11-01", "weekdays", mon) == "2026-11-02"
    assert du.first_occurrence("2026-11-05", None, mon) == "2026-11-05"


def test_ticking_a_repeating_item_moves_it_on():
    mon = date(2026, 11, 2)
    assert du.next_occurrence("2026-10-28", "daily", mon) == "2026-11-03"     # overdue: lands on tomorrow
    assert du.next_occurrence("2026-11-02", "weekly", mon) == "2026-11-09"
    assert du.next_occurrence("2026-11-06", "weekdays", mon) == "2026-11-09"  # Friday -> Monday
    assert du.next_occurrence("2026-01-31", "monthly", date(2026, 1, 31)) == "2026-02-28"
    assert du.next_occurrence("2027-03-14", "yearly", mon) == "2028-03-14"
    assert du.next_occurrence("2026-11-02", "hours:2", mon) == "2026-11-03"   # an hourly nudge is done for today


def test_obvious_list_adds_skip_the_model_and_anything_unclear_does_not():
    import extraction
    lists = ["Reading list", "Movies"]
    items = lambda text: [(i["description"], i["list"]) for i in (extraction.quick_extract(text, lists) or {}).get("follow_ups", [])]
    assert items("Add Sapiens to my reading list") == [("Sapiens", "Reading list")]
    assert items("add milk, eggs and bread to groceries") == [("Milk", "Groceries"), ("Eggs", "Groceries"), ("Bread", "Groceries")]
    assert items("Movies: Dune, Oppenheimer") == [("Dune", "Movies"), ("Oppenheimer", "Movies")]
    assert items("put the book Dune on my reading list") == [("Dune", "Reading list")]
    assert extraction.quick_extract("Add Sapiens to my reading list", lists)["keep_note"] is False
    for unclear in ["Add Sapiens and Atomic Habits to my reading list",   # two titles, or one with "and"?
                    "add Pride and Prejudice to books",
                    "Add Dune to my reading list by Friday",                 # a date
                    "Add Oppenheimer to movies because Priya loved it",      # a reason worth keeping
                    "add a meeting to my calendar",                          # not a list
                    "Note: met Priya today", "add call mom to tasks"]:
        assert extraction.quick_extract(unclear, lists) is None, unclear
    import intent
    assert intent.fast_classify("Groceries: milk, eggs") == "capture"


def find_list_stub(get_lists, supported=lambda: True):
    """db.find_list for tests: same words, same space (None = no space)."""
    import text_utils

    def find_list(uid, name, initiative_id=None, lists=None):
        key = text_utils.list_key(name)
        for l in (get_lists() if lists is None else lists):
            if text_utils.list_key(l["name"]) == key and (not supported() or (l.get("initiative_id") or None) == (initiative_id or None)):
                return l
        return None

    return find_list


def _capture_db(saved):
    lists = {"reading list": {"id": 5, "name": "Reading list", "emoji": "📚"}}

    def create_list(user_id, name, emoji=None, initiative_id=None):
        row = {"id": 10 + len(lists), "name": name, "emoji": emoji, "initiative_id": initiative_id}
        lists[name.lower()] = row
        saved["lists_created"].append((name, emoji))
        return row

    def create_task(user_id, interaction_id, description, **kw):
        saved["tasks"].append((interaction_id, description, kw))
        return 100 + len(saved["tasks"])

    return types.SimpleNamespace(
        create_interaction=lambda u, **kw: saved.update(interaction=kw) or 7,
        create_task=create_task, create_list=create_list,
        get_list_by_name=lambda u, name: lists.get(name.lower()),
        get_lists=lambda u: list(lists.values()),
        find_list=find_list_stub(lambda: list(lists.values())),
        get_list_initiative=lambda u, list_id: saved.get("home", {}).get(list_id),
        get_initiative=lambda u, i: None,
    )


def _wire(cap, saved):
    cap.db = _capture_db(saved)
    cap.embeddings = types.SimpleNamespace(compute_embedding=lambda text, **kw: saved.update(embedded=True) or [0.1])
    cap.search_index = types.SimpleNamespace(enqueue=lambda *a, **k: saved["indexed"].append(a[1:]))


def test_an_items_only_capture_saves_no_note_and_files_list_entries():
    import api.routers.capture as cap
    saved = {"tasks": [], "lists_created": [], "indexed": []}
    _wire(cap, saved)
    extracted = {"keep_note": False, "summary": "", "follow_ups": [
        {"description": "Sapiens", "list": "reading list"},
        {"description": "Oppenheimer", "list": "Movies", "detail": "Nolan, recommended by Priya"},
        {"description": "Mom's birthday", "list": "Birthdays", "due_date": "2026-03-14", "repeat": "yearly"},
        {"description": "Drink water", "list": "Routines", "repeat": "every 2 hours"},
        {"description": "Pay Rahul ₹2,000", "list": "Tasks"},
    ]}
    out = cap._process_extracted("u", "add sapiens to my reading list ...", extracted)
    (part,) = out["parts"]   # one part: the items only, no note
    assert part["interaction_id"] is None and part["note_saved"] is False and "interaction" not in saved
    assert "embedded" not in saved                           # no note -> no embedding call
    assert ("note", [7]) not in saved["indexed"]
    by_desc = {d: (i, kw) for i, d, kw in saved["tasks"]}
    assert all(i is None for i, _ in by_desc.values())
    assert by_desc["Sapiens"][1]["list_id"] == 5             # matched the existing list, case-insensitively
    assert ("Movies", "🎬") in saved["lists_created"] and ("Birthdays", "🎂") in saved["lists_created"]
    assert by_desc["Oppenheimer"][1]["detail"] == "Nolan, recommended by Priya"
    bday = by_desc["Mom's birthday"][1]
    assert bday["repeat"] == "yearly" and bday["due_date"] >= date.today().isoformat()   # rolled to the next one
    water = by_desc["Drink water"][1]
    assert water["repeat"] == "hours:2" and water["due_date"] == date.today().isoformat()
    assert by_desc["Pay Rahul ₹2,000"][1]["list_id"] is None   # "Tasks" is the main list, not a new one
    assert [t["list_name"] for t in part["tasks_created"]] == ["Reading list", "Movies", "Birthdays", "Routines", None]


def test_a_capture_with_nothing_but_keep_note_false_is_still_kept_as_a_note():
    import api.routers.capture as cap
    saved = {"tasks": [], "lists_created": [], "indexed": []}
    _wire(cap, saved)
    out = cap._process_extracted("u", "thinking about health", {"keep_note": False, "summary": "- Health", "follow_ups": []})
    (part,) = out["parts"]
    assert part["interaction_id"] == 7 and part["note_saved"] is True   # never lose the input


def test_the_summary_leaves_out_list_entries_until_their_date_comes():
    today = date.today().isoformat()
    rows = [
        {"id": 1, "description": "Call the bank", "due_date": None, "due_time": None, "status": "open", "list_id": None},
        {"id": 2, "description": "Oppenheimer", "due_date": None, "due_time": None, "status": "open", "list_id": 4},
        {"id": 3, "description": "Mom's birthday", "due_date": today, "due_time": None, "status": "open", "list_id": 5},
        {"id": 4, "description": "Dad's birthday", "due_date": "2999-01-01", "due_time": None, "status": "open", "list_id": 5},
    ]
    pn.db = types.SimpleNamespace(get_all_tasks_with_context=lambda uid, status=None: rows, get_initiatives=lambda uid: [])
    groups = pn.group_open_tasks("u")
    assert groups == [("Others", ["Mom's birthday", "Call the bank"])]


def _item(**kw):
    base = {"id": 9, "user_id": "u", "description": "Call the bank", "due_date": "2026-10-28", "due_time": None,
            "repeat": None, "reminded_key": None, "item_list": None}
    return {**base, **kw}


def utc(h, m=0, day=28):
    return datetime(2026, 10, day, h, m, tzinfo=timezone.utc)


def test_a_timed_item_fires_at_its_local_time_once():
    item = _item(due_time="16:00:00")
    # 16:00 in Kolkata is 10:30 UTC
    assert pn.item_reminder(item, "Asia/Kolkata", utc(10, 29)) is None
    key, msg = pn.item_reminder(item, "Asia/Kolkata", utc(10, 30))
    assert key == "2026-10-28T16:00" and msg["title"] == "Call the bank" and msg["tag"] == "item-9"
    assert pn.item_reminder({**item, "reminded_key": key}, "Asia/Kolkata", utc(10, 31)) is None   # already sent
    assert pn.item_reminder(item, "Asia/Kolkata", utc(12, 31)) is None                            # too old now


def test_a_birthday_fires_the_evening_before_and_hourly_routines_through_the_day():
    bday = _item(description="Mom's birthday", due_date="2026-10-29", repeat="yearly",
                 item_list={"name": "Birthdays", "emoji": "🎂"})
    key, msg = pn.item_reminder(bday, "UTC", utc(20, 5))
    assert key == "eve:2026-10-29" and msg["title"] == "🎂 Mom's birthday" and msg["body"] == "Tomorrow"
    assert pn.item_reminder(bday, "UTC", utc(9, 0, day=29)) is None   # the morning summary covers the day itself

    water = _item(description="Drink water", repeat="hours:2", due_date="2026-10-28")
    assert pn.item_reminder(water, "UTC", utc(8, 59)) is None
    assert pn.item_reminder(water, "UTC", utc(9, 0))[0] == "2026-10-28T09"
    assert pn.item_reminder(water, "UTC", utc(10, 40))[0] == "2026-10-28T09"   # same slot (sent once via reminded_key)
    assert pn.item_reminder(water, "UTC", utc(11, 0))[0] == "2026-10-28T11"
    assert pn.item_reminder(water, "UTC", utc(21, 0)) is None
    assert pn.item_reminder({**water, "due_date": "2026-10-29"}, "UTC", utc(11, 0)) is None   # ticked off for today

    plain = _item()  # a date with no time: only the summary mentions it
    assert pn.item_reminder(plain, "UTC", utc(9, 0)) is None


def test_send_due_sends_item_reminders_and_records_them():
    log = {"pushed": [], "marked": []}
    subs = [{"id": 1, "user_id": "u", "endpoint": "https://push/1", "timezone": "UTC", "last_9am": "2026-10-28", "last_5pm": None}]
    pn.db = types.SimpleNamespace(
        get_push_subscriptions=lambda uid=None: subs,
        get_reminder_candidates=lambda uids, until: [_item(due_time="10:00")],
        mark_task_reminded=lambda tid, key: log["marked"].append((tid, key)),
        delete_push_subscription=lambda endpoint, user_id=None: None,
    )
    out = pn.send_due(utc(10, 1), sender=lambda sub, msg: log["pushed"].append(msg["title"]))
    assert out["items_sent"] == 1 and log["pushed"] == ["Call the bank"] and log["marked"] == [(9, "2026-10-28T10:00")]


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


def test_an_item_added_by_hand_belongs_to_the_category_it_was_added_under():
    import api.routers.tasks as tr
    from api.schemas import TaskCreate
    made = []
    tr.db = types.SimpleNamespace(
        get_list=lambda u, i: {"id": i},
        get_initiative=lambda u, i: {"id": i} if i == 2 else None,
        create_task=lambda u, interaction_id, text, **kw: made.append((interaction_id, text, kw)) or 55,
    )
    tr.search_index = types.SimpleNamespace(enqueue=lambda *a, **k: None)
    assert tr.create_task(TaskCreate(description="Dune", list_id=5, initiative_id=2), "u") == {"id": 55}
    assert made[0][0] is None and made[0][2]["initiative_id"] == 2 and made[0][2]["list_id"] == 5
    try:
        tr.create_task(TaskCreate(description="Dune", initiative_id=99), "u")
        assert False
    except Exception as e:
        assert getattr(e, "status_code", None) == 400


def test_loose_wording_for_a_list_finds_the_one_you_already_have_instead_of_making_another():
    import api.routers.capture as cap
    saved = {"tasks": [], "lists_created": [], "indexed": []}
    _wire(cap, saved)
    extracted = {"keep_note": False, "follow_ups": [
        {"description": "Dune", "list": "my reading list"},      # your "Reading list"
        {"description": "Oppenheimer", "list": "Films"},          # no list yet: made once, as "Movies"
        {"description": "Barbie", "list": "movie list"},          # the same pile, not a second list
    ]}
    cap._process_extracted("u", "x", extracted)
    assert saved["lists_created"] == [("Movies", "🎬")]
    by_desc = {d: kw["list_id"] for _, d, kw in saved["tasks"]}
    assert by_desc["Dune"] == 5 and by_desc["Oppenheimer"] == by_desc["Barbie"] != 5


def test_list_names_that_mean_the_same_share_a_key_but_different_piles_do_not():
    import text_utils
    same = [("Films", "Movies", "watch list"), ("Reading list", "books", "To read"), ("Grocery list", "Shopping", "groceries")]
    for group in same:
        assert len({text_utils.list_key(n) for n in group}) == 1, group
    assert text_utils.list_key("Startup ideas") != text_utils.list_key("Ideas")
    assert text_utils.list_key("Gift ideas") == text_utils.list_key("gift idea")
    assert text_utils.canonical_list_title("films") == "Movies" and text_utils.canonical_list_title("Weekend trips") is None


def test_an_item_with_a_bell_is_not_also_reminded_automatically():
    item = {"id": 1, "description": "Call the bank", "due_date": "2026-11-07", "due_time": "16:00:00", "repeat": None,
            "reminded_key": None, "item_list": None}
    at4pm = datetime(2026, 11, 7, 16, 5, tzinfo=timezone.utc)
    assert pn.item_reminder(item, "UTC", at4pm) is not None            # no bell: reminded at its time
    assert pn.item_reminder({**item, "remind_on": "2026-11-06"}, "UTC", at4pm) is None   # bell set: that one rules


def test_a_new_entry_with_no_space_goes_to_the_space_its_list_already_lives_in():
    import api.routers.capture as cap
    saved = {"tasks": [], "lists_created": [], "indexed": [], "home": {5: 2}}   # the Reading list is in space 2
    _wire(cap, saved)
    cap._process_extracted("u", "x", {"keep_note": False, "follow_ups": [
        {"description": "Sapiens", "list": "reading list"},      # list 5 -> space 2
        {"description": "Oppenheimer", "list": "Movies"},        # a new list, no history -> no space
    ]})
    by_desc = {d: kw["initiative_id"] for _, d, kw in saved["tasks"]}
    assert by_desc["Sapiens"] == 2 and by_desc["Oppenheimer"] is None
    # a space said outright (picked on Home, or named by the model) always wins
    saved["tasks"].clear()
    cap.db.get_initiative = lambda u, i: {"id": i, "name": "Personal"}
    cap._process_extracted("u", "x", {"keep_note": False, "follow_ups": [{"description": "Dune", "list": "reading list"}]},
                           forced_initiative_id=9)
    assert saved["tasks"][0][2]["initiative_id"] == 9


def test_remind_me_before_fires_that_long_ahead_of_the_due_time_once():
    item = _item(due_time="17:00:00", remind_before=30)
    # 17:00 in Kolkata is 11:30 UTC, so 30 minutes before is 11:00 UTC
    assert pn.item_reminder(item, "Asia/Kolkata", utc(10, 59)) is None
    key, msg = pn.item_reminder(item, "Asia/Kolkata", utc(11, 0))
    assert key == "before:2026-10-28T17:00:30" and msg["body"].startswith("In 30 minutes")
    assert pn.item_reminder({**item, "reminded_key": key}, "Asia/Kolkata", utc(11, 1)) is None
    # it replaces the reminder at the due time, and works even when a bell is set
    assert pn.item_reminder({**item, "remind_on": "2026-10-28"}, "Asia/Kolkata", utc(11, 0)) is not None
    assert pn.item_reminder(item, "Asia/Kolkata", utc(11, 30)) is not None  # still inside the grace window, not at due-time key


def test_a_day_before_with_no_time_counts_from_nine_am():
    item = _item(due_date="2026-10-29", remind_before=1440)
    # 09:00 on the 28th in Kolkata = 03:30 UTC
    assert pn.item_reminder(item, "Asia/Kolkata", utc(3, 29)) is None
    key, msg = pn.item_reminder(item, "Asia/Kolkata", utc(3, 30))
    assert msg["body"].startswith("Tomorrow")
    assert pn.before_label(60) == "In 1 hour" and pn.before_label(2880) == "In 2 days"
