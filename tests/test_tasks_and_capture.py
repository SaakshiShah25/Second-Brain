"""Due times, saving a captured note with its tasks, and the agent's task tool.
Run: python tests/test_tasks_and_capture.py"""

import os
import sys
import types
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import date_utils  # noqa: E402


def test_week_phrases_resolve_in_code():
    wed = date(2026, 10, 28)   # a Wednesday
    assert date_utils.resolve_relative_phrase("next week", wed) == "2026-11-04"
    assert date_utils.resolve_relative_phrase("this week", wed) == "2026-10-30"          # that week's Friday
    assert date_utils.resolve_relative_phrase("this week", date(2026, 10, 31)) == "2026-10-31"   # weekend: today
    assert date_utils.resolve_relative_phrase("next Tuesday", wed) == "2026-11-03"
    assert date_utils.resolve_relative_phrase("last Sunday", wed) == "2026-10-25"


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
    one = out["parts"][0]
    assert out["status"] == "saved" and len(out["parts"]) == 1
    assert one["interaction_id"] == 7 and one["initiative_name"] == "Work"
    assert "person_id" not in saved["interaction"] and "person_id" not in saved["tasks"][0][2]
    (_, d1, k1), (_, d2, k2), (_, d3, k3) = saved["tasks"]
    assert (d1, k1["due_date"], k1["due_time"], k1["owner"]) == ("Email Priya the deck", date.today().isoformat(), "18:00", "me")
    assert k2["owner"] == "them" and k2["due_date"] is None
    assert k3["owner"] == "me" and k3["due_time"] == "19:00" and k3["due_date"] == date.today().isoformat()  # a time with no day means today
    assert [t["description"] for t in one["tasks_created"]] == [d1, d2, d3]
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
    bullets = "- Scrum call at 10 AM\n- Shipping v1.0 this week"
    out = cap._process_extracted("u", "x", {"summary": bullets, "decisions": ["- Go ahead"],
                                            "follow_ups": [{"description": "- Join the call", "owner": "me"}]})
    # the summary is stored as "- " bullet points on purpose and must come through untouched
    assert saved["summary"] == bullets and out["parts"][0]["summary"] == bullets
    assert saved["decisions"] == ["Go ahead"] and saved["tasks"] == ["Join the call"]


def test_capture_stores_each_fact_once_and_the_topic_label():
    import api.routers.capture as cap
    saved = {}
    cap.db = types.SimpleNamespace(create_interaction=lambda u, **kw: saved.update(kw) or 1,
                                   create_task=lambda u, i, d, **kw: 2, get_initiative=lambda u, i: None)
    cap.embeddings = types.SimpleNamespace(compute_embedding=lambda t, **k: None)
    cap.search_index = types.SimpleNamespace(enqueue=lambda *a, **k: None)
    extracted = {
        "summary": "- Amazon parcel expected soon\n- Planning a birthday gift for Jeevika\n- Jeevika's birthday is next week",
        "concerns": ["Stock market looks poor, worry about Jio shares"],
        "decisions": [],
        "follow_ups": [{"description": "Check Amazon parcel arrival", "owner": "me"},
                       {"description": "Order a birthday gift for Jeevika from Amazon", "owner": "me"}],
        "section": "Gift Ideas",
    }
    out = cap._process_extracted("u", "raw", extracted)
    # the point that restates the concern and the gift task goes; the real fact (when the birthday is) stays
    assert "Planning a birthday gift" not in saved["summary"] and "Jeevika's birthday is next week" in saved["summary"]
    assert out["parts"][0]["summary"] == saved["summary"]
    assert saved["extracted_facts"] == {"section": "Gift Ideas"}
    # a generic label is not stored; a note that is all to-dos has an empty summary
    saved.clear()
    cap._process_extracted("u", "raw", {"summary": "- Call the bank", "section": "Misc",
                                        "follow_ups": [{"description": "Call the bank", "owner": "me"}]})
    assert saved["summary"] == "" and saved["extracted_facts"] is None


def _split_fakes(linked=True, inits=None):
    import api.routers.capture as cap
    notes, tasks = [], []
    inits = inits if inits is not None else {"Synapse Partnership": 1, "Health": 2}
    def create_initiative(u, name, color=None):
        inits[name] = max(inits.values(), default=0) + 1
        return {"id": inits[name], "name": name}
    cap.db = types.SimpleNamespace(
        create_interaction=lambda u, **kw: notes.append(kw) or len(notes),
        create_task=lambda u, i, d, **kw: tasks.append((i, d)) or len(tasks),
        get_initiative=lambda u, i: {"id": i, "name": {v: k for k, v in inits.items()}.get(i, "x")},
        get_initiative_by_name=lambda u, n: next(({"id": v} for k, v in inits.items() if k.lower() == n.lower()), None),
        source_links_supported=lambda: linked,
        create_initiative=create_initiative,
        get_initiatives=lambda u: [{"id": v, "name": k} for k, v in inits.items()],
    )
    cap.embeddings = types.SimpleNamespace(compute_embedding=lambda t, **k: None)
    cap.search_index = types.SimpleNamespace(enqueue=lambda *a, **k: None)
    return cap, notes, tasks


NOTE = ("Discuss about the fee collection system for teachers for the Synapse partnership. "
        "Jeevika's address is Borivali East,Mumbai. Start focusing on your diet.")


def _three_group_answer():
    # the model tagged each extracted item with its initiative - not each sentence
    return {"groups": [
        {"initiative": "Synapse Partnership", "section": "Fees",
         "follow_ups": [{"description": "Discuss the fee collection system for teachers", "owner": "me"}]},
        {"initiative": None, "summary": "- Jeevika's address is Borivali East, Mumbai"},
        {"initiative": "Health", "follow_ups": [{"description": "Start focusing on your diet", "owner": "me"}]},
    ]}


def test_one_message_about_three_subjects_is_filed_under_three_initiatives():
    cap, notes, tasks = _split_fakes()
    cap.embeddings = types.SimpleNamespace(compute_embedding=lambda t, **k: [0.1])
    out = cap._process_extracted("u", NOTE, _three_group_answer())
    assert [p["initiative_name"] for p in out["parts"]] == ["Synapse Partnership", None, "Health"]
    assert [n["initiative_id"] for n in notes] == [1, None, 2]
    # each task hangs off the note (and so the initiative) it belongs to - this is what the Tasks tab groups by
    assert tasks == [(1, "Discuss the fee collection system for teachers"), (3, "Start focusing on your diet")]
    # the original text is stored once, whole, on the first note; the others point at it instead of repeating it
    assert [n["raw_text"] for n in notes] == [NOTE, "", ""]
    assert [n.get("source_id") for n in notes] == [None, 1, 1]
    assert all("batch" not in (n["extracted_facts"] or {}) for n in notes)
    # ... and only that first note carries the search embedding
    assert [n["embedding"] is None for n in notes] == [False, True, True]


def test_without_the_source_column_every_note_keeps_the_whole_text_with_a_batch_id():
    cap, notes, tasks = _split_fakes(linked=False)
    cap._process_extracted("u", NOTE, _three_group_answer())
    assert all(n["raw_text"] == NOTE and n.get("source_id") is None for n in notes)
    batches = {n["extracted_facts"]["batch"] for n in notes}
    assert len(batches) == 1 and None not in batches


def test_the_notes_page_shows_the_original_under_each_initiative_and_says_where_else_it_went():
    from api.routers.notes import with_sources
    rows = [
        {"id": 1, "raw_text": NOTE, "initiative": {"name": "Synapse Partnership"}},
        {"id": 2, "raw_text": "", "source_id": 1, "initiative": None},
        {"id": 3, "raw_text": "", "source_id": 1, "initiative": {"name": "Health"}},
        {"id": 4, "raw_text": "Call the bank", "initiative": {"name": "Health"}},
    ]
    by_id = {r["id"]: r for r in with_sources(rows)}
    assert all(by_id[i]["raw_text"] == NOTE for i in (1, 2, 3))
    assert by_id[1]["also_in"] == ["Health", "Others"]
    assert by_id[3]["also_in"] == ["Others", "Synapse Partnership"]
    assert by_id[4]["also_in"] == [] and by_id[4]["raw_text"] == "Call the bank"
    assert [by_id[i]["shared_original"] for i in (1, 2, 3, 4)] == [True, True, True, False]
    # unlinked notes from one message (older rows, or before the SQL was run) are tied together by their batch id
    old = with_sources([
        {"id": 5, "raw_text": "x", "extracted_facts": {"batch": "b"}, "initiative": {"name": "A"}},
        {"id": 6, "raw_text": "x", "extracted_facts": {"batch": "b"}, "initiative": {"name": "B"}},
    ])
    assert old[0]["also_in"] == ["B"] and old[1]["also_in"] == ["A"]
    assert not old[0]["shared_original"]


def test_a_message_about_one_subject_is_one_note_with_no_batch():
    cap, notes, tasks = _split_fakes()
    cap._process_extracted("u", "Call the bank", {"groups": [{"initiative": "Health", "follow_ups": [{"description": "Call the bank"}]}]})
    assert len(notes) == 1 and "batch" not in (notes[0]["extracted_facts"] or {})


def test_a_category_picked_by_the_user_keeps_the_whole_message_together():
    cap, notes, tasks = _split_fakes()
    out = cap._process_extracted("u", NOTE, _three_group_answer(), forced_initiative_id=2)
    assert len(out["parts"]) == 1 and len(notes) == 1
    assert notes[0]["raw_text"] == NOTE and notes[0]["initiative_id"] == 2
    assert [d for _, d in tasks] == ["Discuss the fee collection system for teachers", "Start focusing on your diet"]


def test_the_models_groups_are_validated_not_trusted():
    import extraction
    # two groups for the same initiative become one (names compared ignoring case)
    g = extraction.note_groups(NOTE, {"groups": [{"initiative": "Health", "decisions": ["x"], "follow_ups": [{"description": "a"}]},
                                                {"initiative": "health", "decisions": ["y"], "follow_ups": [{"description": "b"}]}]})
    assert len(g) == 1 and g[0]["decisions"] == ["x", "y"] and [f["description"] for f in g[0]["follow_ups"]] == ["a", "b"]
    # a to-do listed under two initiatives is kept once, under the first
    g = extraction.note_groups(NOTE, {"groups": [{"initiative": "A", "follow_ups": [{"description": "Call mom"}]},
                                                {"initiative": "B", "follow_ups": [{"description": " call  MOM "}, {"description": "Pay rent"}]}]})
    assert [[f["description"] for f in x["follow_ups"]] for x in g] == [["Call mom"], ["Pay rent"]]
    # a group the model made up with nothing in it is dropped
    g = extraction.note_groups(NOTE, {"groups": [{"initiative": "A", "summary": "- real"}, {"initiative": "B"}]})
    assert [x["initiative"] for x in g] == ["A"]
    # more than MAX_GROUPS are folded into the last one rather than lost
    many = [{"initiative": f"I{i}", "decisions": [f"d{i}"]} for i in range(6)]
    g = extraction.note_groups(NOTE, {"groups": many})
    assert len(g) == extraction.MAX_GROUPS and sum(len(x["decisions"]) for x in g) == 6
    # a model that ignored the format and answered with one flat object still yields one group
    flat = extraction.note_groups(NOTE, {"initiative": "Health", "summary": "- a", "follow_ups": [{"description": "t"}]})
    assert len(flat) == 1 and flat[0]["initiative"] == "Health" and flat[0]["raw_text"] == NOTE
    # an empty answer is still one (empty) group rather than an error
    assert len(extraction.note_groups(NOTE, {})) == 1


def test_the_original_is_embedded_once_however_many_initiatives_it_touches():
    cap, notes, tasks = _split_fakes()
    calls = []
    cap.embeddings = types.SimpleNamespace(compute_embedding=lambda t, **k: calls.append(t) or [0.1])
    cap._process_extracted("u", NOTE, _three_group_answer())
    assert calls == [NOTE] and notes[0]["embedding"] == [0.1]


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


def test_a_group_that_fits_no_initiative_gets_a_new_one_so_its_tasks_are_not_left_in_others():
    cap, notes, tasks = _split_fakes(inits={"Work": 1})
    out = cap._process_extracted("u", "Sell Jio shares asap. Start exercising daily.", {"groups": [
        {"initiative": None, "suggested_initiative": "Finance", "follow_ups": [{"description": "Sell Jio shares"}]},
        {"initiative": None, "suggested_initiative": "health", "follow_ups": [{"description": "Start exercising daily"}]},
        {"initiative": None, "suggested_initiative": "Health", "concerns": ["Back pain is getting worse"]},
    ]})
    # the two Health groups are one; each new initiative is created and the tasks hang off the note filed under it
    assert [p["initiative_name"] for p in out["parts"]] == ["Finance", "Health"]
    assert [p["new_initiative"] for p in out["parts"]] == [True, True]
    assert [n["initiative_id"] for n in notes] == [2, 3]
    assert [i for i, _ in tasks] == [1, 2]
    # a name that already exists is reused, not created again
    out = cap._process_extracted("u", "More shares", {"groups": [
        {"initiative": None, "suggested_initiative": " finance. ", "follow_ups": [{"description": "Buy shares"}]}]})
    assert out["parts"][0]["initiative_id"] == 2 and out["parts"][0]["new_initiative"] is False


def test_new_initiatives_are_capped_and_the_rest_stay_as_suggestions():
    cap, notes, tasks = _split_fakes(inits={"Work": 1})
    groups = [{"initiative": None, "suggested_initiative": n, "decisions": [n]} for n in ("A", "B", "C")]
    out = cap._process_extracted("u", "x", {"groups": groups})
    assert [p["new_initiative"] for p in out["parts"]] == [True, True, False]
    assert out["parts"][2]["initiative_id"] is None and out["parts"][2]["suggested_initiative"] == "C"
    # a name that is too long to be a category is not created
    out = cap._process_extracted("u", "x", {"groups": [{"initiative": None, "suggested_initiative": "x" * 60, "decisions": ["d"]}]})
    assert out["parts"][0]["initiative_id"] is None
    # the user's own category is never overridden by a suggestion
    out = cap._process_extracted("u", "x", {"groups": [{"initiative": None, "suggested_initiative": "Zed", "decisions": ["d"]}]},
                                 forced_initiative_id=1)
    assert out["parts"][0]["initiative_id"] == 1 and out["parts"][0]["new_initiative"] is False


def test_an_instruction_to_the_app_is_not_saved_as_a_task_decision_or_point():
    import extraction
    g = extraction.note_groups("x", {"groups": [{
        "initiative": None, "suggested_initiative": "Reading",
        "summary": "- Create a new initiative called reading\n- Book is about stakeholder capitalism",
        "decisions": ["Decided to add a task to connect with Pratik Bhai"],
        "follow_ups": [{"description": "Create a new initiative called reading"}, {"description": "Read Conscious Capitalism by John Mackey"},
                       {"description": "Add a task to connect with Pratik Bhai"}],
    }]})
    assert g[0]["suggested_initiative"] == "Reading"
    assert g[0]["summary"] == "- Book is about stakeholder capitalism"
    assert g[0]["decisions"] == []
    # the real to-dos stay (the wrapper on "Add a task to ..." is stripped later, when the task is saved)
    assert [f["description"] for f in g[0]["follow_ups"]] == ["Read Conscious Capitalism by John Mackey", "Add a task to connect with Pratik Bhai"]
