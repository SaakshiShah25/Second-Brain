"""Tests for memory_schema.py - the rules behind person_fact, relationship and
key_date. Plain asserts: run with `python tests/test_memory_schema.py`
(or pytest, if installed). No database, no model calls."""

import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import memory_schema as m

REF = date(2026, 10, 5)  # a Monday


# ---- key dates
def test_explicit_birthday():
    d = m.clean_key_date({"label": "Birthday", "month": 3, "day": 14}, REF)
    assert d["date_type"] == "birthday" and (d["month"], d["day"]) == (3, 14) and d["subject"] == "self"


def test_label_less_birthday_gets_default_label():
    d = m.clean_key_date({"kind": "birthday", "month": 3, "day": 14}, REF)
    assert d["label"] == "Birthday"


def test_relative_phrase_resolves_against_note_date():
    d = m.clean_key_date({"label": "Birthday", "when": "tomorrow"}, REF)
    assert (d["month"], d["day"]) == (10, 6)


def test_month_only_is_kept_as_approximate():
    d = m.clean_key_date({"label": "Birthday", "subject": "child", "subject_name": "Anya", "month": 6}, REF)
    assert d["month"] == 6 and d["day"] is None and d["subject_name"] == "Anya"


def test_impossible_dates_are_rejected():
    assert m.clean_key_date({"label": "Birthday", "month": 2, "day": 30}, REF) is None
    assert m.clean_key_date({"label": "Birthday", "month": 13, "day": 1}, REF) is None
    assert m.clean_key_date({"label": "Birthday"}, REF) is None
    assert m.clean_key_date("nonsense", REF) is None


def test_feb_29_is_valid_and_observed_on_feb_28():
    d = m.clean_key_date({"label": "Birthday", "month": 2, "day": 29}, REF)
    assert d is not None
    assert m.next_occurrence(2, 29, date(2027, 1, 1)) == date(2027, 2, 28)
    assert m.next_occurrence(2, 29, date(2028, 1, 1)) == date(2028, 2, 29)


def test_an_age_milestone_is_a_birthday():
    assert m.birthday_from_age_milestone("turns 5 in June") == {"month": 6, "day": None}
    assert m.birthday_from_age_milestone("Turning 40 on March 3") == {"month": 3, "day": 3}
    assert m.birthday_from_age_milestone("turned 5") is None and m.birthday_from_age_milestone("likes June weather") is None


def test_an_anniversary_is_always_shared_with_a_spouse():
    d = m.clean_key_date({"label": "Wedding anniversary", "date_type": "anniversary", "subject": "self", "month": 11, "day": 2}, REF)
    assert d["subject"] == "spouse"


def test_custom_date_needs_a_name():
    assert m.clean_key_date({"date_type": "custom", "month": 5, "day": 2}, REF) is None
    d = m.clean_key_date({"label": "Son's annual day", "month": 5, "day": 2}, REF)
    assert d["date_type"] == "custom" and d["label"] == "Son's annual day"


def test_implausible_year_is_dropped_but_date_kept():
    d = m.clean_key_date({"label": "Birthday", "month": 3, "day": 14, "year": 1750}, REF)
    assert d["year"] is None and d["day"] == 14
    assert m.clean_key_date({"label": "Birthday", "month": 3, "day": 14, "year": 1990}, REF)["year"] == 1990


def test_anniversary_is_inferred_from_the_label():
    d = m.clean_key_date({"label": "Wedding anniversary", "month": 11, "day": 2, "subject": "spouse",
                          "subject_name": "Karan"}, REF)
    assert d["date_type"] == "anniversary" and d["subject"] == "spouse"


def test_duplicates_and_cap():
    raw = [{"label": "Birthday", "month": 3, "day": 14}] * 3 + \
          [{"label": f"Event {i}", "date_type": "custom", "month": 1, "day": i + 1} for i in range(10)]
    out = m.clean_key_dates(raw, REF)
    assert len(out) == m.MAX_DATES_PER_PERSON
    assert sum(1 for x in out if x["date_type"] == "birthday") == 1


def test_days_until_and_description():
    assert m.days_until(10, 6, REF) == 1
    assert m.days_until(10, 5, REF) == 0
    assert m.days_until(10, 4, REF) == 364
    assert m.days_until(6, None, REF) is None
    text = m.describe_key_date({"date_type": "birthday", "label": "Birthday", "month": 10, "day": 6,
                                "subject": "self", "subject_name": None, "year": None}, REF)
    assert text == "Birthday: 6 October (tomorrow)"
    child = m.describe_key_date({"date_type": "birthday", "label": "Birthday", "month": 6, "day": None,
                                 "subject": "child", "subject_name": "Anya", "year": None}, REF)
    assert "Anya" in child and "day not known" in child


# ---- facts
def test_fact_attribute_synonyms():
    assert m.clean_fact({"attribute": "Hobbies", "value": "painting"})["attribute"] == "hobby"
    assert m.clean_fact({"attribute": "city", "value": "Pune"})["attribute"] == "lives_in"
    assert m.clean_fact({"attribute": "something odd", "value": "x"})["attribute"] == "other"


def test_empty_or_bad_facts_are_dropped():
    assert m.clean_fact({"attribute": "likes", "value": "   "}) is None
    assert m.clean_fact(None) is None
    assert m.clean_fact("likes coffee") is None


def test_sensitive_facts_have_no_plain_norm():
    health = m.clean_fact({"attribute": "health", "value": "Diabetic"})
    assert health["is_sensitive"] is True and health["value_norm"] is None
    likes = m.clean_fact({"attribute": "likes", "value": "Coffee over tea!"})
    assert likes["is_sensitive"] is False and likes["value_norm"] == "coffee over tea"


def test_single_valued_attributes():
    assert m.is_single_valued("lives_in") and m.is_single_valued("company")
    assert not m.is_single_valued("hobby") and not m.is_single_valued("likes")


def test_subject_normalisation():
    assert m.clean_subject("wife", "Karan") == ("spouse", "Karan")
    assert m.clean_subject("Daughter", "Anya") == ("child", "Anya")
    assert m.clean_subject("self", "ignored") == ("self", None)
    assert m.clean_subject("neighbour's dog", None)[0] == "other"


def test_fact_list_dedupes_and_caps():
    raw = [{"attribute": "likes", "value": "Coffee"}, {"attribute": "like", "value": "coffee!"}] + \
          [{"attribute": "hobby", "value": f"hobby {i}"} for i in range(20)]
    out = m.clean_facts(raw)
    assert len(out) == m.MAX_FACTS_PER_PERSON
    assert sum(1 for f in out if f["attribute"] == "likes") == 1
    assert m.clean_facts("not a list") == []


def test_a_move_is_lives_in_not_a_life_event():
    for text, place in [("moved to Bangalore", "Bangalore"), ("shifted to Delhi", "Delhi"),
                        ("Relocated to New Delhi last year", "New Delhi"), ("moved to Pune for work", "Pune")]:
        f = m.clean_fact({"attribute": "life_event", "value": text})
        assert (f["attribute"], f["value"]) == ("lives_in", place), (text, f)
    # the model's "lives in" with a sentence in it is cleaned the same way
    assert m.clean_fact({"attribute": "lives_in", "value": "moved to Pune"})["value"] == "Pune"
    # a real milestone, or a move that names no place, stays a life event
    assert m.clean_fact({"attribute": "life_event", "value": "got married"})["attribute"] == "life_event"
    assert m.clean_fact({"attribute": "life_event", "value": "moved to a new house"})["attribute"] == "life_event"
    # and the same move filed twice becomes one fact
    both = m.clean_facts([{"attribute": "life_event", "value": "moved to Delhi"}, {"attribute": "lives_in", "value": "Delhi"}])
    assert [(f["attribute"], f["value"]) for f in both] == [("lives_in", "Delhi")]


# ---- relationships
def test_rel_types_from_the_words_used():
    cases = {"Priya's sister": "sibling", "her husband": "spouse", "Rahul's mom": "parent",
             "his daughter": "child", "my cousin": "relative", "college friend": "friend",
             "Rohan's colleague, might join": "colleague", "the CTO": "colleague", "": "other",
             "from the gym": "other"}
    for label, expected in cases.items():
        assert m.rel_type_of(label) == expected, (label, m.rel_type_of(label))


def test_rel_group_and_inverse():
    assert m.rel_group_of("Priya's sister") == "family"
    assert m.rel_group_of("a friend") == "friend"
    assert m.rel_group_of("manager") == "colleague"
    assert m.rel_group_of("unclear") == "related_to"
    assert m.INVERSE_REL_TYPE["parent"] == "child" and m.INVERSE_REL_TYPE["spouse"] == "spouse"


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  ok   {name}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL {name}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
