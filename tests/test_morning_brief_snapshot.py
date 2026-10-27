"""The morning brief is written once a day and kept. Run: python tests/test_morning_brief_snapshot.py"""

import os
import sys
import types
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import morning_brief as mb  # noqa: E402

calls = {"llm": 0}
data = {"today": date.today().isoformat(),
        "due_today": [{"description": "Send the deck", "due_date": date.today().isoformat(), "owner": "me",
                       "person": None, "interaction": {}}],
        "overdue": [], "no_due_date_count": 0, "calendar_events": [], "stale_people": []}


def setup():
    calls["llm"] = 0
    mb._memory.clear()
    mb._gather_brief_data = lambda uid: data
    mb.db = types.SimpleNamespace(get_user_preference=lambda u: {},
                                  get_daily_brief=lambda u, d: (_ for _ in ()).throw(RuntimeError("no table")),
                                  save_daily_brief=lambda *a: (_ for _ in ()).throw(RuntimeError("no table")))

    def fake_chat(model, **kw):
        calls["llm"] += 1
        msg = types.SimpleNamespace(content=f"brief version {calls['llm']}")
        return types.SimpleNamespace(choices=[types.SimpleNamespace(message=msg)])

    mb.llm_budget = types.SimpleNamespace(chat=fake_chat)


def test_the_brief_does_not_change_when_tasks_change_during_the_day():
    setup()
    first, written = mb.get_morning_brief("u1")
    data["due_today"] = []          # you completed everything
    data["overdue"] = [{"description": "x", "due_date": "2026-01-01", "owner": "me", "person": None, "interaction": {}}]
    again, written_again = mb.get_morning_brief("u1")
    assert again == first == "brief version 1" and written_again == written and calls["llm"] == 1


def test_refresh_writes_a_new_one_from_the_current_state():
    setup()
    data["due_today"] = data["due_today"] or [{"description": "y", "due_date": data["today"], "owner": "me", "person": None, "interaction": {}}]
    mb.get_morning_brief("u1")
    fresh, _ = mb.get_morning_brief("u1", refresh=True)
    assert fresh == "brief version 2" and calls["llm"] == 2
    assert mb.get_morning_brief("u1")[0] == "brief version 2"   # and that is now the day's brief


def test_a_quiet_morning_is_kept_too_so_a_task_added_later_does_not_flip_it():
    setup()
    quiet = dict(data, due_today=[], overdue=[], calendar_events=[], stale_people=[])
    mb._gather_brief_data = lambda uid: quiet
    first, _ = mb.get_morning_brief("u1")
    assert first.startswith("Nothing urgent") and calls["llm"] == 0
    mb._gather_brief_data = lambda uid: data      # a task is added mid-morning
    assert mb.get_morning_brief("u1")[0] == first and calls["llm"] == 0


def test_each_person_has_their_own_brief():
    setup()
    a = mb.get_morning_brief("u1")[0]
    b = mb.get_morning_brief("u2")[0]
    assert a != b and calls["llm"] == 2


def test_the_email_path_gets_the_same_text():
    setup()
    assert mb.generate_morning_brief("u1") == mb.get_morning_brief("u1")[0] and calls["llm"] == 1


if __name__ == "__main__":
    tests = [(k, f) for k, f in sorted(globals().items()) if k.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn(); print(f"  ok   {name}")
        except Exception as e:  # noqa: BLE001
            failed += 1; print(f"  FAIL {name}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
