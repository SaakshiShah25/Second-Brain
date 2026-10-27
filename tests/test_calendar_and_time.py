"""Due times, calendar occurrences of yearly dates, and the task-edit rules.
Run: python tests/test_calendar_and_time.py"""

import os
import sys
import types
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_graph_memory as g  # noqa: E402  (fake db + search_index stub)

import date_utils  # noqa: E402
import memory_schema  # noqa: E402

graph, fake, U = g.graph, g.fake, g.U


def test_clock_times_are_normalised_or_dropped():
    cases = {"19:00": "19:00", "7pm": "19:00", "7:30 PM": "19:30", "12am": "00:00", "12pm": "12:00", "9 a.m.": "09:00",
             "19:30:00": "19:30", "noon": "12:00", "midnight": "00:00", "0:05": "00:05"}
    for raw, expected in cases.items():
        assert date_utils.to_valid_time(raw) == expected, (raw, date_utils.to_valid_time(raw))
    for bad in ["evening", "EOD", "25:00", "7", "", None, 5, "13pm", "7:60 pm"]:
        assert date_utils.to_valid_time(bad) is None, bad


def test_birthdays_fall_on_the_right_days_in_a_range():
    g.reset((1, "Priya", []), (2, "Rohan", []))
    graph.record_key_date(U, 1, memory_schema.clean_key_date({"label": "Birthday", "month": 3, "day": 14, "year": 1990}), ("manual", None))
    graph.record_key_date(U, 2, memory_schema.clean_key_date({"label": "Birthday", "month": 10, "day": 30}), ("manual", None))
    rows = graph.key_date_occurrences(U, date(2026, 10, 1), date(2026, 10, 31))
    assert [(r["date"], r["title"]) for r in rows] == [("2026-10-30", "Rohan's birthday")]
    march = graph.key_date_occurrences(U, date(2027, 3, 1), date(2027, 3, 31))
    assert [(r["date"], r["title"], r["age"]) for r in march] == [("2027-03-14", "Priya's birthday (turns 37)", 37)]


def test_a_range_across_new_year_finds_both_ends():
    g.reset((1, "Priya", []))
    graph.record_key_date(U, 1, memory_schema.clean_key_date({"label": "Birthday", "month": 12, "day": 31}), ("manual", None))
    graph.record_key_date(U, 1, memory_schema.clean_key_date({"label": "Wedding anniversary", "date_type": "anniversary", "subject": "spouse", "month": 1, "day": 2}), ("manual", None))
    rows = graph.key_date_occurrences(U, date(2026, 12, 20), date(2027, 1, 10))
    assert [r["date"] for r in rows] == ["2026-12-31", "2027-01-02"]


def test_feb_29_lands_on_feb_28_in_a_normal_year_and_on_29_in_a_leap_year():
    g.reset((1, "Priya", []))
    graph.record_key_date(U, 1, memory_schema.clean_key_date({"label": "Birthday", "month": 2, "day": 29}), ("manual", None))
    assert [r["date"] for r in graph.key_date_occurrences(U, date(2027, 2, 1), date(2027, 2, 28))] == ["2027-02-28"]
    assert [r["date"] for r in graph.key_date_occurrences(U, date(2028, 2, 1), date(2028, 2, 29))] == ["2028-02-29"]


def test_month_only_dates_cannot_be_placed_on_a_day():
    g.reset((1, "Priya", []))
    graph.record_key_date(U, 1, memory_schema.clean_key_date({"label": "Birthday", "subject": "child", "subject_name": "Anya", "month": 6}), ("manual", None))
    assert graph.key_date_occurrences(U, date(2027, 6, 1), date(2027, 6, 30)) == []


def test_one_wedding_anniversary_is_one_calendar_entry_not_two():
    g.reset((1, "Priya", []), (2, "Karan", []))
    for pid, other in ((1, "Karan"), (2, "Priya")):
        graph.record_key_date(U, pid, memory_schema.clean_key_date(
            {"label": "Wedding anniversary", "date_type": "anniversary", "subject": "spouse", "subject_name": other, "month": 11, "day": 2}), ("manual", None))
    rows = graph.key_date_occurrences(U, date(2026, 11, 1), date(2026, 11, 30))
    assert len(rows) == 1 and rows[0]["title"] == "Wedding anniversary: Karan & Priya" or rows[0]["title"] == "Wedding anniversary: Priya & Karan"


def test_the_anniversary_is_one_entry_even_when_two_contacts_share_a_name():
    g.reset((1, "Priya", []), (2, "Karan", []), (3, "Priya", []))   # two Priyas
    for pid, other in ((1, "Karan"), (2, "Priya")):
        graph.record_key_date(U, pid, memory_schema.clean_key_date(
            {"label": "Wedding anniversary", "date_type": "anniversary", "subject": "spouse", "subject_name": other, "month": 11, "day": 2}), ("manual", None))
    assert len(graph.key_date_occurrences(U, date(2026, 11, 1), date(2026, 11, 30))) == 1
    assert len(graph.upcoming_key_dates(U, within_days=60, today=date(2026, 10, 27))) == 1


def test_agenda_orders_timed_tasks_by_clock_then_untimed():
    import api.routers.agenda as agenda
    tasks = [
        {"id": 1, "description": "no time", "due_date": "2026-10-30", "due_time": None, "status": "open", "owner": "me"},
        {"id": 2, "description": "evening", "due_date": "2026-10-30", "due_time": "19:00:00", "status": "open", "owner": "me"},
        {"id": 3, "description": "morning", "due_date": "2026-10-30", "due_time": "09:30:00", "status": "open", "owner": "me"},
        {"id": 4, "description": "other day", "due_date": "2026-11-02", "due_time": None, "status": "done", "owner": "them",
         "person": {"id": 9, "name": "Rohan"}},
        {"id": 5, "description": "out of range", "due_date": "2027-03-01", "due_time": None, "status": "open", "owner": "me"},
    ]
    agenda.db = types.SimpleNamespace(get_all_tasks_with_context=lambda uid: tasks)
    agenda.graph = types.SimpleNamespace(key_date_occurrences=lambda uid, a, b: [])
    out = agenda.agenda("2026-10-01", "2026-11-30", "u")
    assert [t["id"] for t in out["tasks"]] == [3, 2, 1, 4]
    assert out["tasks"][0]["due_time"] == "09:30" and out["tasks"][3]["person"] == {"id": 9, "name": "Rohan"}
    try:
        agenda.agenda("2026-11-30", "2026-10-01", "u"); assert False
    except Exception as e:
        assert getattr(e, "status_code", None) == 400


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
