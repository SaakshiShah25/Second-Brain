"""The agent's key_dates / query_people tools and the wording rules that
trigger them - against the in-memory database stand-in from
test_graph_memory.py. Run: python tests/test_agent_memory_tools.py"""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_graph_memory as g  # noqa: E402  (installs the fake db + search_index stub)

import agent  # noqa: E402
import memory_schema  # noqa: E402

agent.db = g.fake


def run_for(*people):
    g.reset(*people)
    r = agent._Run.__new__(agent._Run)
    r.user_id, r.people, r.sources, r.documents, r.ambiguous = g.U, list(g.fake.people.values()), {}, None, []
    r.labels = agent._unique_labels(r.people)
    r.question, r.hit_people, r.auto_resolved, r._graph_ctx = "", {}, {}, None
    return r


def test_birthday_question_for_a_person_with_a_birthday():
    r = run_for((1, "Priya", []))
    g.graph.record_key_date(g.U, 1, memory_schema.clean_key_date({"label": "Birthday", "month": 3, "day": 14}), ("manual", None))
    out = r.key_dates(person="Priya", date_type="birthday")
    assert out["person"] == "Priya" and out["key_dates"][0].startswith("Birthday: 14 March")


def test_missing_birthday_is_stated_plainly_not_guessed():
    r = run_for((1, "Priya", []))
    out = r.key_dates(person="Priya", date_type="birthday")
    assert out["key_dates"] == [] and "No birthday is recorded for Priya" in out["note"]
    assert r.key_dates(person="Nobody")["not_found"]


def test_whose_birthday_is_next_month_lists_everyone():
    r = run_for((1, "Priya", []), (2, "Rohan", []))
    g.graph.record_key_date(g.U, 1, memory_schema.clean_key_date({"label": "Birthday", "month": 11, "day": 9}), ("manual", None))
    g.graph.record_key_date(g.U, 2, memory_schema.clean_key_date({"label": "Birthday", "month": 11, "day": 21}), ("manual", None))
    g.graph.record_key_date(g.U, 2, memory_schema.clean_key_date({"label": "Wedding anniversary", "month": 4, "day": 2}), ("manual", None))
    out = r.key_dates(date_type="birthday", month=11)
    assert [d["person"] for d in out["key_dates"]] == ["Priya", "Rohan"]
    assert r.key_dates(date_type="birthday", month=6)["key_dates"] == []


def test_query_people_tool():
    r = run_for((1, "Priya", ["friend"]), (2, "Rohan", ["client"]))
    g.graph.record_fact(g.U, 1, "likes", "coffee over tea", ("manual", None), None)
    g.graph.record_fact(g.U, 2, "likes", "tea", ("manual", None), None)
    out = r.query_people(attribute="likes", value="coffee")
    assert [p["name"] for p in out["people"]] == ["Priya"] and "likes: coffee over tea" in out["people"][0]["matched"]
    assert r.query_people(attribute="likes", value="whisky")["people"] == []
    assert "error" in r.query_people()


def test_wording_rules_pick_the_date_tool():
    people = [{"id": 1, "name": "Priya", "aliases": []}]
    calls = dict((n, a) for n, a in agent._obvious_calls("When is Priya's birthday?", people))
    assert calls["key_dates"] == {"person": "Priya", "date_type": "birthday"}
    calls = dict((n, a) for n, a in agent._obvious_calls("Whose birthday is coming up?", people))
    assert calls["key_dates"] == {"date_type": "birthday"}
    calls = dict((n, a) for n, a in agent._obvious_calls("when is their wedding anniversary", people))
    assert calls["key_dates"] == {"date_type": "anniversary"}
    assert "key_dates" not in dict(agent._obvious_calls("What did Priya say about pricing?", people))


def test_two_priyas_get_distinct_labels_and_a_chosen_label_resolves_to_one():
    r = run_for((1, "Priya", []), (2, "Priya", []), (3, "Rohan", []))
    r.people[0].update(role="Application Developer", company="IBM", first_met_date="2026-10-07")
    r.people[1].update(first_met_date="2026-10-20")
    r.labels = agent._unique_labels(r.people)
    assert r.labels[1] == "Priya (Application Developer · IBM)" and r.labels[2] == "Priya (met 20 Oct 2026)"
    assert r.labels[3] == "Rohan"
    # the bare name is still ambiguous - it must never silently pick one
    person, ambiguous = r.resolve_person("Priya")
    assert person is None and sorted(ambiguous) == sorted([r.labels[1], r.labels[2]])
    # ...but the exact label the app offered is one specific contact
    assert r.resolve_person(r.labels[2])[0]["id"] == 2
    assert r.resolve_person(r.labels[1])[0]["id"] == 1


def test_a_chosen_contact_skips_the_name_loop_and_feeds_key_dates():
    r = run_for((1, "Priya", []), (2, "Priya", []))
    r.labels = agent._unique_labels(r.people)
    chosen = r.people[1]
    calls = agent._obvious_calls("When is Priya's birthday?", r.people, chosen)
    names = [(n, a) for n, a in calls]
    assert ("person_profile", {"name": r.labels[2]}) in names
    assert ("key_dates", {"person": r.labels[2], "date_type": "birthday"}) in names
    assert sum(1 for n, _ in names if n == "person_profile") == 1


def test_a_tapped_choice_is_routed_back_to_its_question_not_logged_as_a_note():
    from api.routers import chat
    from api.schemas import ChatRequest
    history = [{"role": "user", "content": "When is Priya's birthday?"},
               {"role": "assistant", "content": "Which Priya are you referring to?", "options": ["Priya (IBM)", "Priya"]}]
    assert chat._clarification_reply(ChatRequest(text="Priya", history=history)) == ("When is Priya's birthday?", "Priya")
    # a normal new message is untouched
    assert chat._clarification_reply(ChatRequest(text="Met Priya today", history=history)) == (None, None)
    # an option typed with no clarifying question before it is just a message
    assert chat._clarification_reply(ChatRequest(text="Priya", history=[history[0]])) == (None, None)
    assert chat._clarification_reply(ChatRequest(text="Priya", history=[])) == (None, None)


def test_who_is_anyas_mother_is_answered_from_the_link_without_asking_which_priya():
    r = run_for((1, "Priya", []), (2, "Priya", []), (3, "Anya", []))
    r.people[0].update(role="Application Developer", company="IBM")
    r.people[1].update(first_met_date="2026-10-25")
    r.labels = agent._unique_labels(r.people)
    # Anya's mother is the SECOND Priya, recorded by id
    g.graph.db.upsert_relationship(g.U, src_type="person", src_id=3, rel="family", rel_type="child", dst_type="person",
                                   dst_id=2, label="Priya's daughter", source_type="interaction", source_id=1)
    agent.db.get_interactions_for_person = lambda uid, pid: []
    agent.db.get_tasks_for_person = lambda uid, pid: []
    out = r.person_profile("Anya")
    link = out["relationships"][0]
    assert link["relation"] == "parent" and link["person"] == "Priya (met 25 Oct 2026)" and link["ref"] == "person:2"
    # opening that person again by ref (or label) is never ambiguous
    assert r.resolve_person("person:2")[0]["id"] == 2
    assert r.resolve_person(link["person"])[0]["id"] == 2
    assert r.resolve_person("Priya")[0] is None  # the bare name still is


def test_asking_about_someone_who_is_not_a_contact_looks_them_up_by_name():
    people = [{"id": 1, "name": "Priya", "aliases": []}]
    calls = agent._obvious_calls("When is Rohan's bday?", people)
    assert ("key_dates", {"person": "Rohan", "date_type": "birthday"}) in calls
    assert not any(n == "key_dates" and not a.get("person") for n, a in calls)   # no "everyone's birthdays" call
    calls = agent._obvious_calls("What is the birthday of Rohan", people)
    assert ("key_dates", {"person": "Rohan", "date_type": "birthday"}) in calls
    calls = agent._obvious_calls("Who is Rohan's wife?", people)
    assert ("person_profile", {"name": "Rohan"}) in calls
    # a known contact is unchanged; a general question names nobody
    assert ("key_dates", {"person": "Priya", "date_type": "birthday"}) in agent._obvious_calls("When is Priya's birthday?", people)
    assert ("key_dates", {"date_type": "birthday"}) in agent._obvious_calls("Whose birthday is coming up?", people)
    assert agent._asked_about("What's the weather") is None and agent._asked_about("when's it") is None


def test_the_tool_says_there_is_no_such_contact():
    r = run_for((1, "Priya", []))
    assert "no contact named 'Rohan'" in r.key_dates(person="Rohan", date_type="birthday")["not_found"]
    assert "no contact named 'Rohan'" in r.person_profile("Rohan")["not_found"]


def _two_priyas(question):
    r = run_for((1, "Priya", []), (2, "Priya", []), (3, "Anya", []))
    r.people[0].update(role="Application Developer", company="IBM")
    r.labels = agent._unique_labels(r.people)
    r.question = question
    return r


def test_a_shared_name_is_settled_when_only_one_contact_has_the_relation_asked_about():
    r = _two_priyas("Who is Priya's child?")
    g.graph.db.upsert_relationship(g.U, src_type="person", src_id=3, rel="family", rel_type="child", dst_type="person",
                                   dst_id=2, label="Priya's daughter", source_type="interaction", source_id=1)
    person, ambiguous = r.resolve_person("Priya")
    assert person and person["id"] == 2 and ambiguous is None
    assert "only one" in r.auto_resolved[2]


def test_a_shared_name_is_still_asked_when_both_have_that_relation_or_neither_does():
    r = _two_priyas("Who is Priya's child?")
    assert r.resolve_person("Priya")[0] is None          # nobody has a child link
    for dst in (1, 2):
        g.graph.db.upsert_relationship(g.U, src_type="person", src_id=3, rel="family", rel_type="child", dst_type="person",
                                       dst_id=dst, label="Priya's daughter", source_type="interaction", source_id=dst)
    r2 = _two_priyas("Who is Priya's child?")
    assert r2.resolve_person("Priya")[0] is None          # both do


def test_search_results_settle_a_name_only_for_questions_about_what_a_note_says():
    r = _two_priyas("Find the note that talks about Priya's party")
    r.hit_people = {2: 0}
    assert r.resolve_person("Priya")[0]["id"] == 2
    r = _two_priyas("When is Priya's birthday?")
    r.hit_people = {2: 0}                                  # the same evidence proves nothing here
    assert r.resolve_person("Priya")[0] is None and r.ambiguous
    r = _two_priyas("Find the note that talks about Priya's party")
    r.hit_people = {1: 0, 2: 1}                            # both appear: still ask
    assert r.resolve_person("Priya")[0] is None


def test_tools_are_registered_for_the_planner():
    names = {t["function"]["name"] for t in agent.TOOLS}
    assert {"key_dates", "query_people", "person_profile"} <= names


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
