"""Tests for how graph.py files extracted details into person_fact, key_date
and relationship - against an in-memory stand-in for the database (no
Supabase, no model calls). Run: python tests/test_graph_memory.py"""

import os
import sys
import types
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class FakeDB:
    """Just enough of db.py for graph.py: tables are lists of dicts."""

    def __init__(self):
        self.facts, self.dates, self.rels, self.people, self._id = [], [], [], {}, 0

    def _next(self):
        self._id += 1
        return self._id

    # people / orgs / docs
    def get_all_people(self, uid): return list(self.people.values())
    def get_organizations(self, uid): return []
    def get_documents(self, uid): return []
    def upsert_organization(self, uid, name, key): return {"id": 1, "name": name, "name_key": key}

    # person_fact
    def get_person_facts(self, uid, person_id=None):
        return [f for f in self.facts if person_id is None or f["person_id"] == person_id]
    def insert_person_fact(self, uid, **f):
        row = {"id": self._next(), "superseded_by": None, "valid_to": None, **f}
        self.facts.append(row); return row
    def update_person_fact(self, uid, fid, **f):
        next(x for x in self.facts if x["id"] == fid).update(f)
    def delete_person_facts(self, uid, ids): self.facts = [f for f in self.facts if f["id"] not in ids]

    # key_date
    def get_key_dates(self, uid, person_id=None):
        return [d for d in self.dates if person_id is None or d["person_id"] == person_id]
    def insert_key_date(self, uid, **f):
        row = {"id": self._next(), **f}; self.dates.append(row); return row
    def update_key_date(self, uid, kid, **f): next(x for x in self.dates if x["id"] == kid).update(f)
    def delete_key_dates(self, uid, ids): self.dates = [d for d in self.dates if d["id"] not in ids]

    # relationship
    def get_relationships(self, uid, entity_type=None, entity_id=None, rel=None):
        rows = [r for r in self.rels if rel is None or r["rel"] == rel]
        if entity_type is not None:
            rows = [r for r in rows if (r["src_type"] == entity_type and r["src_id"] == entity_id)
                    or (r["dst_type"] == entity_type and r["dst_id"] == entity_id)]
        return rows
    def upsert_relationship(self, uid, **f):
        key = ("src_type", "src_id", "rel", "dst_type", "dst_id")
        for r in self.rels:
            if all(r[k] == f[k] for k in key):
                r.update(f); return
        self.rels.append({"id": self._next(), "valid_to": None, **f})
    def update_relationship(self, uid, rid, **f): next(x for x in self.rels if x["id"] == rid).update(f)
    def delete_relationships(self, uid, ids): self.rels = [r for r in self.rels if r["id"] not in ids]


fake = FakeDB()
sys.modules["search_index"] = types.SimpleNamespace(enqueue=lambda *a, **k: None)  # no index in tests
import graph  # noqa: E402
import memory_schema  # noqa: E402

graph.db = fake
U = "user-1"
TODAY = date(2026, 10, 5)


def reset(*people):
    fake.__init__()
    for pid, name, tags in people:
        fake.people[pid] = {"id": pid, "name": name, "aliases": [], "tags": tags, "role": "", "company": ""}


def test_likes_accumulate_and_are_not_duplicated():
    reset((1, "Priya", []))
    for _ in range(2):
        graph.record_fact(U, 1, "likes", "coffee over tea", ("interaction", 10), "2026-10-05")
    graph.record_fact(U, 1, "likes", "Coffee over tea!", ("interaction", 11), "2026-10-06")
    graph.record_fact(U, 1, "hobby", "trekking", ("interaction", 11), "2026-10-06")
    cur = [f for f in fake.facts if f["superseded_by"] is None]
    assert sorted((f["attribute"], f["value"]) for f in cur) == [("hobby", "trekking"), ("likes", "coffee over tea")]


def test_single_valued_fact_is_superseded_not_overwritten():
    reset((1, "Priya", []))
    graph.record_fact(U, 1, "lives_in", "Mumbai", ("interaction", 1), "2026-01-01")
    graph.record_fact(U, 1, "lives_in", "Pune", ("interaction", 2), "2026-09-01")
    mem = graph.person_memory(U, 1, TODAY)
    assert [f["value"] for f in mem["facts"]] == ["Pune"]
    assert [(h["value"], h["until"]) for h in mem["history"]] == [("Mumbai", "2026-09-01")]


def test_manual_value_is_not_replaced_by_a_note():
    reset((1, "Priya", []))
    graph.record_fact(U, 1, "diet", "vegan", ("manual", None), "2026-10-01")
    graph.record_fact(U, 1, "diet", "vegetarian", ("interaction", 5), "2026-10-05")
    assert [f["value"] for f in graph.person_memory(U, 1, TODAY)["facts"]] == ["vegan"]


def test_hearsay_is_upgraded_when_stated():
    reset((1, "Priya", []))
    graph.record_fact(U, 1, "hobby", "golf", ("interaction", 1), None, confidence="likely")
    graph.record_fact(U, 1, "hobby", "golf", ("interaction", 2), None, confidence="stated")
    assert len(fake.facts) == 1 and fake.facts[0]["confidence"] == "stated"


def test_facts_about_a_relative_keep_their_subject():
    reset((1, "Priya", []))
    graph.record_fact(U, 1, "hobby", "painting", ("interaction", 1), None, subject="child", subject_name="Anya")
    graph.record_fact(U, 1, "hobby", "painting", ("interaction", 1), None)  # her own, same words
    assert len(fake.facts) == 2


def test_sensitive_fact_has_no_plain_copy():
    reset((1, "Priya", []))
    graph.record_fact(U, 1, "health", "diabetic", ("interaction", 1), None)
    assert fake.facts[0]["is_sensitive"] is True and fake.facts[0]["value_norm"] is None


def test_key_date_same_again_adds_nothing_and_month_only_is_completed():
    reset((1, "Priya", []))
    june = memory_schema.clean_key_date({"label": "Birthday", "subject": "child", "subject_name": "Anya", "month": 6})
    graph.record_key_date(U, 1, june, ("interaction", 1))
    graph.record_key_date(U, 1, june, ("interaction", 2))
    assert len(fake.dates) == 1 and fake.dates[0]["day"] is None
    # a later note gives the day -> same row replaced by the fuller date, not a second birthday
    full = memory_schema.clean_key_date({"label": "Birthday", "subject": "child", "subject_name": "Anya", "month": 6, "day": 3})
    graph.record_key_date(U, 1, full, ("interaction", 3))
    assert len(fake.dates) == 1 and (fake.dates[0]["month"], fake.dates[0]["day"]) == (6, 3)


def test_manual_birthday_wins_over_a_note():
    reset((1, "Priya", []))
    mine = memory_schema.clean_key_date({"label": "Birthday", "month": 3, "day": 14})
    other = memory_schema.clean_key_date({"label": "Birthday", "month": 3, "day": 15})
    graph.record_key_date(U, 1, mine, ("manual", None))
    graph.record_key_date(U, 1, other, ("interaction", 9))
    assert [(d["month"], d["day"]) for d in fake.dates] == [(3, 14)]


def test_a_later_note_corrects_an_earlier_note():
    reset((1, "Priya", []))
    graph.record_key_date(U, 1, memory_schema.clean_key_date({"label": "Birthday", "month": 3, "day": 14}), ("interaction", 1))
    graph.record_key_date(U, 1, memory_schema.clean_key_date({"label": "Birthday", "month": 3, "day": 15}), ("interaction", 2))
    assert [(d["month"], d["day"]) for d in fake.dates] == [(3, 15)]


def test_full_note_is_filed_into_all_three_tables():
    """The README example: birthday, spouse + anniversary, child + her birthday month, likes, hobby, city."""
    reset((1, "Priya", []), (2, "Karan", []), (3, "Anya", []))
    extracted = {
        "primary_person": {
            "name": "Priya", "role": "Application Developer", "company": "IBM",
            "personal_notes": "Likes coffee over tea; training for a marathon; moved to Pune last year.",
            "facts": [
                {"attribute": "likes", "value": "coffee over tea"},
                {"attribute": "goal", "value": "training for a marathon"},
                {"attribute": "lives_in", "value": "Pune"},
                {"attribute": "hobby", "value": "painting", "subject": "child", "subject_name": "Anya"},
            ],
            "key_dates": [
                {"label": "Birthday", "date_type": "birthday", "month": 3, "day": 14},
                {"label": "Wedding anniversary", "date_type": "anniversary", "subject": "spouse",
                 "subject_name": "Karan", "month": 11, "day": 2},
            ],
        },
        "other_people": [
            {"name": "Karan", "relation": "Priya's husband", "present": False},
            {"name": "Anya", "relation": "Priya's daughter", "present": False,
             "key_dates": [{"label": "Birthday", "date_type": "birthday", "month": 6}]},
        ],
    }
    linked = [{"name": "Karan", "person_id": 2, "relation": "Priya's husband"},
              {"name": "Anya", "person_id": 3, "relation": "Priya's daughter"}]
    graph.on_capture(U, 77, "2026-10-05", 1, extracted, linked)

    mem = graph.person_memory(U, 1, TODAY)
    texts = sorted(f"{f['subject']}|{f['attribute']}|{f['value']}" for f in mem["facts"])
    assert "self|likes|coffee over tea" in texts and "self|lives_in|Pune" in texts
    assert "child|hobby|painting" not in texts          # Anya is a contact: it went on HER record
    assert [f["value"] for f in graph.person_memory(U, 3, TODAY)["facts"] if f["attribute"] == "hobby"] == ["painting"]
    assert sorted(k["date_type"] for k in mem["key_dates"]) == ["anniversary", "birthday"]
    birthday = next(k for k in mem["key_dates"] if k["date_type"] == "birthday")
    assert birthday["text"] == "Birthday: 14 March (in 160 days)", birthday["text"]
    # Anya's own birthday month went onto Anya (month only)
    anya = graph.person_memory(U, 3, TODAY)["key_dates"]
    assert len(anya) == 1 and anya[0]["day"] is None
    # the wedding anniversary is on BOTH partners' pages, each naming the other
    karan_dates = graph.person_memory(U, 2, TODAY)["key_dates"]
    assert [(k["date_type"], k["subject"], k["subject_name"], k["month"], k["day"]) for k in karan_dates] == \
        [("anniversary", "spouse", "Priya", 11, 2)]
    assert karan_dates[0]["text"].startswith("Wedding anniversary: 2 November")   # not "Priya's ..."
    # relationships: Karan is Priya's spouse, Anya is her child (what each IS to Priya)
    by_name = {r["name"]: r["relation"] for r in mem["relationships"]}
    assert by_name == {"Karan": "spouse", "Anya": "child"}, by_name
    # ...and seen from Karan's side, Priya is his spouse
    assert {r["name"]: r["relation"] for r in graph.person_memory(U, 2, TODAY)["relationships"]} == {"Priya": "spouse"}
    # provenance
    assert all(f["source"] == "interaction" for f in mem["facts"] if f["attribute"] in ("likes", "lives_in"))


def test_child_birthday_given_on_the_parent_goes_to_the_child():
    reset((1, "Priya", []), (3, "Anya", []))
    extracted = {"primary_person": {"name": "Priya", "key_dates": [
        {"label": "Birthday", "subject": "child", "subject_name": "Anya", "month": 6, "day": 3}]}}
    graph.on_capture(U, 1, "2026-10-05", 1, extracted, [{"name": "Anya", "person_id": 3, "relation": "Priya's daughter"}])
    assert graph.person_memory(U, 1, TODAY)["key_dates"] == []
    anya = graph.person_memory(U, 3, TODAY)["key_dates"]
    assert len(anya) == 1 and anya[0]["subject"] == "self" and anya[0]["text"].startswith("Birthday: 3 June")


def test_a_relative_who_is_not_a_contact_stays_on_the_person():
    reset((1, "Priya", []))
    extracted = {"primary_person": {"name": "Priya", "key_dates": [
        {"label": "Birthday", "subject": "child", "subject_name": "Anya", "month": 6, "day": 3}]}}
    graph.on_capture(U, 1, "2026-10-05", 1, extracted, [])
    kd = graph.person_memory(U, 1, TODAY)["key_dates"]
    assert len(kd) == 1 and kd[0]["subject"] == "child" and kd[0]["text"].startswith("Anya's birthday")


def test_one_anniversary_is_listed_once_not_per_partner():
    reset((1, "Priya", []), (2, "Karan", []))
    a = memory_schema.clean_key_date({"label": "Wedding anniversary", "subject": "spouse", "subject_name": "Karan", "month": 10, "day": 20})
    b = memory_schema.clean_key_date({"label": "Wedding anniversary", "subject": "spouse", "subject_name": "Priya", "month": 10, "day": 20})
    graph.record_key_date(U, 1, a, ("manual", None)); graph.record_key_date(U, 2, b, ("manual", None))
    assert len(graph.upcoming_key_dates(U, within_days=30, today=TODAY)) == 1


def test_who_likes_coffee_ignores_what_a_childs_likes():
    reset((1, "Priya", []), (2, "Neha", []))
    graph.record_fact(U, 1, "likes", "coffee", ("manual", None), None, subject="child", subject_name="Anya")
    graph.record_fact(U, 2, "likes", "coffee", ("manual", None), None)
    assert [p["name"] for p in graph.query_people(U, attribute="likes", value="coffee")] == ["Neha"]
    assert [p["name"] for p in graph.query_people(U, attribute="likes", value="coffee", subject="child")] == ["Priya"]


def test_successive_moves_build_a_timeline_of_places():
    reset((1, "Priya", []))
    for i, (text, day) in enumerate([("moved to Pune", "2026-01-10"), ("moved to Bangalore", "2026-09-01"), ("shifted to Delhi", "2026-10-25")]):
        extracted = {"primary_person": {"name": "Priya", "facts": [{"attribute": "life_event", "value": text}]}}
        graph.on_capture(U, i + 1, day, 1, extracted, [])
    mem = graph.person_memory(U, 1, TODAY)
    assert [f["value"] for f in mem["facts"] if f["attribute"] == "lives_in"] == ["Delhi"]
    assert [f for f in mem["facts"] if f["attribute"] == "life_event"] == []
    assert [(h["value"], h["until"]) for h in mem["history"]] == [("Pune", "2026-09-01"), ("Bangalore", "2026-10-25")]


def test_repair_turns_old_move_life_events_into_a_correct_timeline():
    """Exactly what happened: 'lives in Pune', then 'life event: moved to Bangalore', then 'lives in Delhi'
    (the last two logged the same day)."""
    reset((1, "Priya", []))
    graph.record_fact(U, 1, "lives_in", "Pune", ("interaction", 1), "2026-01-10")
    old_event = fake.insert_person_fact(U, person_id=1, attribute="life_event", value="moved to Bangalore", subject="self",
                                        confidence="stated", source_type="interaction", source_id=2, observed_on="2026-10-25")
    delhi = fake.insert_person_fact(U, person_id=1, attribute="lives_in", value="Delhi", subject="self", confidence="stated",
                                    source_type="interaction", source_id=3, observed_on="2026-10-25")
    for f in fake.facts:  # the old code had already closed Pune when Delhi arrived
        if f["value"] == "Pune":
            f["superseded_by"], f["valid_to"] = delhi["id"], "2026-10-25"
    fake.get_interaction_links = lambda uid: []
    fake.get_all_interactions = lambda uid: []
    graph.rebuild_user(U)
    mem = graph.person_memory(U, 1, TODAY)
    assert [f["value"] for f in mem["facts"] if f["attribute"] == "lives_in"] == ["Delhi"]
    assert not [f for f in fake.facts if f["attribute"] == "life_event"]
    assert [h["value"] for h in mem["history"]] == ["Pune", "Bangalore"]
    graph.rebuild_user(U)   # repeating changes nothing
    assert len([f for f in fake.facts if f["attribute"] == "lives_in"]) == 3


def test_on_capture_reports_what_it_remembered():
    reset((1, "Priya", []), (2, "Karan", []))
    extracted = {"primary_person": {"name": "Priya", "facts": [{"attribute": "likes", "value": "coffee over tea"}],
                                    "key_dates": [{"label": "Birthday", "month": 3, "day": 14}]}}
    tally = graph.on_capture(U, 1, "2026-10-05", 1, extracted, [{"name": "Karan", "person_id": 2, "relation": "Priya's husband"}])
    assert (tally["facts"], tally["key_dates"], tally["links"]) == (1, 1, 1)
    assert "Priya: likes · coffee over tea" in tally["items"] and "Priya: Birthday · 14 March" in tally["items"]
    assert "Karan is Priya's spouse" in tally["items"]
    assert graph.on_capture(U, 2, "2026-10-06", 1, extracted, [])["facts"] == 0   # nothing new the second time


def test_the_kept_payload_lets_rebuild_refile_a_note_whose_filing_never_happened():
    reset((1, "Priya", []), (3, "Anya", []))
    extracted = {"primary_person": {"name": "Priya", "facts": [{"attribute": "likes", "value": "coffee"}],
                                    "key_dates": [{"label": "Birthday", "month": 3, "day": 14}]},
                 "other_people": [{"name": "Anya", "key_dates": [{"label": "Birthday", "month": 6}]}]}
    payload = graph.memory_payload(extracted)
    assert set(payload) == {"primary_person", "other_people"} and graph.memory_payload({"primary_person": {"name": "P"}}) == {}
    fake.get_all_interactions = lambda uid: [{"id": 7, "person_id": 1, "date": "2026-10-05", "extracted_facts": {"memory": payload}}]
    fake.get_interaction_links = lambda uid: [{"interaction_id": 7, "person_id": 3, "relation": "Priya's daughter"}]
    graph.rebuild_user(U)
    assert [f["value"] for f in fake.facts if f["person_id"] == 1 and f["attribute"] == "likes"] == ["coffee"]
    assert sorted((d["person_id"], d["month"]) for d in fake.dates) == [(1, 3), (3, 6)]   # Priya's, and Anya's own
    n = len(fake.dates); graph.rebuild_user(U)
    assert len(fake.dates) == n


def test_the_exact_extraction_that_went_wrong_files_everything_where_it_belongs():
    """What the model returned for the Priya note on 25 Oct: the anniversary said 'self' with no spouse
    named, Anya's age came in as a 'life event' filed under Anya as her own child, links as bare words."""
    reset((1, "Priya", []), (2, "Karan", []), (3, "Anya", []))
    extracted = {
        "primary_person": {"name": "Priya", "facts": [{"attribute": "likes", "value": "coffee over tea"}],
                           "key_dates": [{"label": "Birthday", "date_type": "birthday", "subject": "self", "month": 3, "day": 14},
                                         {"label": "Wedding anniversary", "date_type": "anniversary", "subject": "self",
                                          "subject_name": None, "month": 11, "day": 2}]},
        "other_people": [{"name": "Karan", "relation": "spouse", "facts": [], "key_dates": []},
                         {"name": "Anya", "relation": "daughter", "key_dates": [],
                          "facts": [{"attribute": "life_event", "value": "turns 5 in June", "subject": "child", "subject_name": "Anya"}]}]}
    linked = [{"name": "Karan", "person_id": 2, "relation": "spouse"}, {"name": "Anya", "person_id": 3, "relation": "daughter"}]
    graph.on_capture(U, 144, "2026-10-25", 1, extracted, linked)
    # the anniversary is on BOTH, each naming the other
    assert [(d["subject"], d["subject_name"]) for d in fake.dates if d["person_id"] == 1 and d["date_type"] == "anniversary"] == [("spouse", "Karan")]
    assert [(d["subject"], d["subject_name"]) for d in fake.dates if d["person_id"] == 2] == [("spouse", "Priya")]
    # "turns 5 in June" became Anya's OWN birthday (month known), not "Anya's child Anya"
    assert [(d["subject"], d["month"], d["day"]) for d in fake.dates if d["person_id"] == 3] == [("self", 6, None)]
    assert [f for f in fake.facts if f["person_id"] == 3] == []
    # the family links exist both ways round
    assert {r["name"]: r["relation"] for r in graph.person_memory(U, 1, TODAY)["relationships"]} == {"Karan": "spouse", "Anya": "child"}
    assert {r["name"]: r["relation"] for r in graph.person_memory(U, 3, TODAY)["relationships"]} == {"Priya": "parent"}
    assert {r["name"]: r["relation"] for r in graph.person_memory(U, 2, TODAY)["relationships"]} == {"Priya": "spouse"}


def test_an_unnamed_spouse_is_filled_in_from_the_notes_own_links():
    reset((1, "Priya", []), (2, "Karan", []))
    extracted = {"primary_person": {"name": "Priya", "key_dates": [
        {"label": "Wedding anniversary", "date_type": "anniversary", "subject": "spouse", "month": 11, "day": 2}]}}
    graph.on_capture(U, 1, "2026-10-25", 1, extracted, [{"name": "Karan", "person_id": 2, "relation": "her husband"}])
    assert any(d["person_id"] == 2 and d["subject_name"] == "Priya" for d in fake.dates)


def test_turns_5_in_june_files_as_the_childs_own_birthday_month():
    reset((1, "Priya", []), (3, "Anya", []))
    extracted = {"primary_person": {"name": "Priya"},
                 "other_people": [{"name": "Anya", "facts": [{"attribute": "life_event", "value": "turns 5 in June", "subject": "child", "subject_name": "Anya"}]}]}
    graph.on_capture(U, 1, "2026-10-25", 1, extracted, [{"name": "Anya", "person_id": 3, "relation": "daughter"}])
    assert [(d["person_id"], d["date_type"], d["month"], d["day"], d["subject"]) for d in fake.dates] == [(3, "birthday", 6, None, "self")]
    assert fake.facts == []   # not also kept as a sentence


def test_a_nameless_anniversary_and_the_named_one_are_the_same_date():
    reset((1, "Priya", []))
    graph.record_key_date(U, 1, memory_schema.clean_key_date({"label": "Wedding anniversary", "date_type": "anniversary", "subject": "spouse", "month": 11, "day": 2}), ("interaction", 1))
    graph.record_key_date(U, 1, memory_schema.clean_key_date({"label": "Wedding anniversary", "date_type": "anniversary", "subject": "spouse", "subject_name": "Karan", "month": 11, "day": 2}), ("interaction", 2))
    assert [(d["subject"], d["subject_name"]) for d in fake.dates] == [("spouse", "Karan")]


def test_capturing_the_same_note_twice_adds_nothing():
    reset((1, "Priya", []))
    extracted = {"primary_person": {"name": "Priya", "facts": [{"attribute": "likes", "value": "coffee"}],
                                    "key_dates": [{"label": "Birthday", "month": 3, "day": 14}]}}
    graph.on_capture(U, 1, "2026-10-05", 1, extracted, [])
    n_facts, n_dates = len(fake.facts), len(fake.dates)
    graph.on_capture(U, 2, "2026-10-06", 1, extracted, [])
    assert (len(fake.facts), len(fake.dates)) == (n_facts, n_dates)


def test_garbage_from_the_model_is_ignored_not_fatal():
    reset((1, "Priya", []))
    extracted = {"primary_person": {"name": "Priya", "facts": "likes coffee", "key_dates": [
        {"label": "Birthday", "month": 2, "day": 31}, {"label": "x"}, 5, None]}}
    graph.on_capture(U, 1, "2026-10-05", 1, extracted, [])
    assert fake.dates == [] and [f for f in fake.facts if f["attribute"] == "likes"] == []


def test_upcoming_dates_and_month_queries():
    reset((1, "Priya", []), (2, "Rohan", []))
    graph.record_key_date(U, 1, memory_schema.clean_key_date({"label": "Birthday", "month": 10, "day": 20}), ("manual", None))
    graph.record_key_date(U, 2, memory_schema.clean_key_date({"label": "Birthday", "month": 11, "day": 2}), ("manual", None))
    graph.record_key_date(U, 2, memory_schema.clean_key_date({"label": "Wedding anniversary", "month": 10, "day": 7}), ("manual", None))
    soon = graph.upcoming_key_dates(U, within_days=30, today=TODAY)
    assert [(r["person"], r["days_until"]) for r in soon] == [("Rohan", 2), ("Priya", 15), ("Rohan", 28)]
    only_birthdays = graph.upcoming_key_dates(U, within_days=30, date_types=["birthday"], today=TODAY)
    assert [r["person"] for r in only_birthdays] == ["Priya", "Rohan"]
    november = graph.upcoming_key_dates(U, month=11, today=TODAY)
    assert [r["person"] for r in november] == ["Rohan"]


def test_query_people_by_fact_and_relation():
    reset((1, "Priya", ["friend"]), (2, "Rohan", ["client"]), (3, "Neha", ["friend"]))
    graph.record_fact(U, 1, "diet", "vegetarian", ("manual", None), None)
    graph.record_fact(U, 2, "diet", "vegetarian", ("manual", None), None)
    graph.record_fact(U, 3, "likes", "coffee over tea", ("manual", None), None)
    assert [p["name"] for p in graph.query_people(U, attribute="diet", value="vegetarian")] == ["Priya", "Rohan"]
    assert [p["name"] for p in graph.query_people(U, attribute="diet", value="vegetarian", relation="friends")] == ["Priya"]
    assert [p["name"] for p in graph.query_people(U, value="coffee")] == ["Neha"]
    assert graph.query_people(U, attribute="diet", value="vegan") == []


def test_merge_moves_facts_and_dates_and_drops_duplicates():
    reset((1, "Priya", []), (2, "Priya K", []))
    bday = memory_schema.clean_key_date({"label": "Birthday", "month": 3, "day": 14})
    graph.record_key_date(U, 1, bday, ("manual", None))
    graph.record_key_date(U, 2, bday, ("interaction", 4))
    graph.record_fact(U, 2, "likes", "coffee", ("interaction", 4), None)
    graph.repoint(U, 2, 1)
    assert len([d for d in fake.dates if d["person_id"] == 1]) == 1 and not [d for d in fake.dates if d["person_id"] == 2]
    assert [f["person_id"] for f in fake.facts] == [1]


def test_rebuild_adds_a_missing_anniversary_to_the_spouse():
    reset((1, "Priya", []), (2, "Karan", []))
    graph.record_key_date(U, 1, memory_schema.clean_key_date(
        {"label": "Wedding anniversary", "subject": "spouse", "subject_name": "Karan", "month": 11, "day": 2}), ("interaction", 5))
    fake.get_interaction_links = lambda uid: []
    fake.get_all_interactions = lambda uid: []
    graph.rebuild_user(U)
    karan = [d for d in fake.dates if d["person_id"] == 2]
    assert len(karan) == 1 and karan[0]["subject_name"] == "Priya"
    graph.rebuild_user(U)
    assert len([d for d in fake.dates if d["person_id"] == 2]) == 1


def test_rebuild_backfills_a_legacy_important_dates_list():
    reset((1, "Priya", []))
    fake.people[1]["important_dates"] = [{"label": "Birthday", "month": 3, "day": 14, "year": 1990},
                                         {"label": "Anniversary", "month": 11, "day": 2}]
    fake.get_interaction_links = lambda uid: []
    fake.get_all_interactions = lambda uid: []
    stats = graph.rebuild_user(U)
    assert stats["key_dates"] == 2
    assert sorted((d["date_type"], d["month"], d["day"]) for d in fake.dates) == [("anniversary", 11, 2), ("birthday", 3, 14)]
    graph.rebuild_user(U)
    assert len(fake.dates) == 2  # idempotent


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
