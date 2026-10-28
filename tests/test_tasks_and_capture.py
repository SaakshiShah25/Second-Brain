"""Due times, saving a captured note with its tasks, and the agent's task tool.
Run: python tests/test_tasks_and_capture.py"""

import os
import sys
import types
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import date_utils  # noqa: E402


def test_clock_times_are_normalised_or_dropped():
    cases = {"19:00": "19:00", "7pm": "19:00", "7:30 PM": "19:30", "12am": "00:00", "12pm": "12:00", "9 a.m.": "09:00",
             "19:30:00": "19:30", "noon": "12:00", "midnight": "00:00", "0:05": "00:05"}
    for raw, expected in cases.items():
        assert date_utils.to_valid_time(raw) == expected, (raw, date_utils.to_valid_time(raw))
    for bad in ["evening", "EOD", "25:00", "7", "", None, 5, "13pm", "7:60 pm"]:
        assert date_utils.to_valid_time(bad) is None, bad


def test_capture_saves_the_note_and_its_tasks_without_any_person():
    import api.routers.capture as cap
    saved = {"interaction": None, "tasks": [], "indexed": []}

    def create_interaction(user_id, **kw):
        saved["interaction"] = kw
        return 7

    def create_task(user_id, interaction_id, description, **kw):
        saved["tasks"].append((interaction_id, description, kw))
        return 100 + len(saved["tasks"])

    cap.db = types.SimpleNamespace(create_interaction=create_interaction, create_task=create_task,
                                   get_initiative=lambda u, i: {"id": i, "name": "Work"})
    cap.embeddings = types.SimpleNamespace(compute_embedding=lambda text, **kw: [0.1])
    cap.search_index = types.SimpleNamespace(enqueue=lambda *a, **k: saved["indexed"].append(a[1:]))
    extracted = {"summary": "Need to email the deck.", "topics": ["deck"], "decisions": [], "concerns": [],
                 "follow_ups": [{"description": "Email Priya the deck", "due_date": "today", "due_time": "18:00", "owner": "me"},
                                {"description": "Rohan to send pricing", "due_date": None, "owner": "them"},
                                {"description": "Fix the fan", "due_date": None, "due_time": "7pm", "owner": "nonsense"}]}
    out = cap._process_extracted("u", "email the deck by 6pm", extracted, forced_initiative_id=3)
    assert out["status"] == "saved" and out["interaction_id"] == 7 and out["initiative_name"] == "Work"
    assert "person_id" not in saved["interaction"] and "person_id" not in saved["tasks"][0][2]
    (_, d1, k1), (_, d2, k2), (_, d3, k3) = saved["tasks"]
    assert (d1, k1["due_date"], k1["due_time"], k1["owner"]) == ("Email Priya the deck", date.today().isoformat(), "18:00", "me")
    assert k2["owner"] == "them" and k2["due_date"] is None
    assert k3["owner"] == "me" and k3["due_time"] == "19:00" and k3["due_date"] == date.today().isoformat()  # a time with no day means today
    assert [t["description"] for t in out["tasks_created"]] == [d1, d2, d3]
    assert ("note", [7]) in saved["indexed"]


def test_list_markers_are_stripped_from_the_saved_note():
    import text_utils
    for raw, clean in {"- Scrum call at 10 AM": "Scrum call at 10 AM", "• Upload the doc": "Upload the doc",
                       "  * Pay rent": "Pay rent", "Complete the course": "Complete the course", "": ""}.items():
        assert text_utils.strip_bullet(raw) == clean, raw
    assert text_utils.strip_bullet(None) is None
    import api.routers.capture as cap
    saved = {}
    cap.db = types.SimpleNamespace(create_interaction=lambda u, **kw: saved.update(kw) or 1,
                                   create_task=lambda u, i, d, **kw: saved.setdefault("tasks", []).append(d) or 2,
                                   get_initiative=lambda u, i: None)
    cap.embeddings = types.SimpleNamespace(compute_embedding=lambda t, **k: None)
    cap.search_index = types.SimpleNamespace(enqueue=lambda *a, **k: None)
    out = cap._process_extracted("u", "x", {"summary": "- Scrum call at 10 AM", "decisions": ["- Go ahead"],
                                            "follow_ups": [{"description": "- Join the call", "owner": "me"}]})
    assert saved["summary"] == "Scrum call at 10 AM" and out["summary"] == "Scrum call at 10 AM"
    assert saved["decisions"] == ["Go ahead"] and saved["tasks"] == ["Join the call"]


def test_the_agent_lists_tasks_with_exact_filters():
    import agent
    today = date.today()
    rows = [
        {"id": 1, "description": "overdue one", "status": "open", "owner": "me", "due_date": (today - timedelta(days=2)).isoformat(), "due_time": None},
        {"id": 2, "description": "soon", "status": "open", "owner": "them", "due_date": (today + timedelta(days=1)).isoformat(), "due_time": "09:00:00"},
        {"id": 3, "description": "later", "status": "open", "owner": "me", "due_date": (today + timedelta(days=30)).isoformat(), "due_time": None},
        {"id": 4, "description": "finished", "status": "done", "owner": "me", "due_date": None, "due_time": None},
    ]
    agent.db = types.SimpleNamespace(get_all_tasks_with_context=lambda uid, status=None: [r for r in rows if not status or r["status"] == status])
    rt = agent._Run("u")
    assert [t["description"] for t in rt.list_tasks(overdue_only=True)["tasks"]] == ["overdue one"]
    assert [t["description"] for t in rt.list_tasks(owner="them")["tasks"]] == ["soon"]
    assert [t["description"] for t in rt.list_tasks(due_within_days=7)["tasks"]] == ["overdue one", "soon"]
    assert rt.list_tasks(status="all")["count"] == 4
    soon = rt.list_tasks(owner="them")["tasks"][0]
    assert soon["due_time"] == "09:00" and soon["owner"] == "someone else"
    assert "task:2" in rt.sources


def test_obvious_calls_are_just_search_plus_tasks_when_asked_about_to_dos():
    import agent
    assert [c[0] for c in agent._obvious_calls("what did I note about pricing")] == ["search"]
    calls = agent._obvious_calls("what do I owe this week")
    assert [c[0] for c in calls] == ["search", "list_tasks"] and calls[1][1]["owner"] == "me"
    assert agent._obvious_calls("what do they owe me")[1][1]["owner"] == "them"
    assert agent._normalise_kinds(["notes", "People", "documents", "todo"]) == ["note", "task"]


def test_intent_routes_obvious_messages_for_free():
    import intent
    assert intent.fast_classify("What's overdue?") == "ask"
    # a to-do phrased as an instruction to yourself is a note, even when the topic sounds like trivia
    for todo in ["Understand how mutual funds work", "Learn Spanish by March", "Research health insurance options",
                 "Send the deck to Arjun by 6pm", "Get access to the backend repository by EOD", "Call the bank"]:
        assert intent.fast_classify(todo) == "capture", todo
    # aimed at the assistant (or a question): left to the model / the ask path
    for aimed in ["Tell me a joke", "Explain how mutual funds work", "Write me a poem", "Can you send me a recipe",
                  "Send me a joke about cats", "pull my passport and photo"]:
        assert intent.fast_classify(aimed) is None, aimed


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
