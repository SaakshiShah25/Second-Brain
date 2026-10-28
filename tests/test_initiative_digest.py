"""initiative_digest.py: how notes become points, when the model is (and
isn't) called, caching by fingerprint, and the guarantees on its output."""

import json
import types

import pytest

import initiative_digest as dg


def _note(id_, summary, decisions=(), concerns=(), initiative_id=1, date="2026-10-20"):
    return {"id": id_, "summary": summary, "decisions": list(decisions), "concerns": list(concerns),
            "initiative_id": initiative_id, "date": date}


def test_points_from_bullets_paragraphs_decisions_and_concerns():
    assert dg._points(_note(1, "- a\n- b\n• c")) == ["a", "b", "c"]
    assert dg._points(_note(1, "One sentence. Two.")) == ["One sentence. Two."]
    assert dg._points(_note(1, "- a", ["keep price"], ["churn risk"])) == ["a", "Decided: keep price", "Concern: churn risk"]
    assert dg._points(_note(1, "")) == []


@pytest.fixture
def store(monkeypatch, obs):
    saved = {}
    monkeypatch.setattr(dg, "_memory", {})
    monkeypatch.setattr(dg.db, "get_initiative_digest", lambda uid, iid: saved.get((uid, iid)))

    def save(uid, iid, fp, digest, at):
        saved[(uid, iid)] = {"fingerprint": fp, "digest": digest, "created_at": at}

    monkeypatch.setattr(dg.db, "save_initiative_digest", save)
    return saved


def _notes(monkeypatch, notes):
    monkeypatch.setattr(dg.db, "get_all_interactions_with_context", lambda uid: notes)


def _llm(monkeypatch, payload):
    calls = []

    def chat(model, **kw):
        calls.append(kw)
        return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps(payload)))])

    monkeypatch.setattr(dg.llm_budget, "chat", chat)
    monkeypatch.setattr(dg.llm_budget, "can_spend", lambda m, t: True)
    return calls


BIG_NOTES = [_note(i, f"- point {i}a\n- point {i}b") for i in range(4)]  # 8 points


def test_small_initiative_lists_points_without_a_model_call(monkeypatch, store):
    _notes(monkeypatch, [_note(1, "- a\n- b"), _note(2, "- a\n- c")])
    calls = _llm(monkeypatch, {})
    d = dg.get_digest("u", 1, "Fitness")
    assert calls == [] and d["organised"] is False
    assert d["sections"] == [{"title": "Notes", "points": ["a", "b", "c"]}]  # de-duplicated


def test_others_bucket_and_empty_initiative(monkeypatch, store):
    _notes(monkeypatch, [_note(1, "- loose", initiative_id=None), _note(2, "- x", initiative_id=5)])
    assert dg.get_digest("u", dg.OTHERS, "Other notes")["sections"][0]["points"] == ["loose"]
    assert dg.get_digest("u", 99, "Empty") == {"note_count": 0, "generated_at": None, "organised": False, "sections": []}


def test_model_output_is_cleaned_deduplicated_and_capped(monkeypatch, store):
    _notes(monkeypatch, BIG_NOTES)
    _llm(monkeypatch, {"sections": [
        {"title": "Thesis", "points": ["Moat is route density", "Consolidation play"]},
        {"title": "Concentration", "points": ["Moat is route density"]},  # repeat -> section vanishes
        {"title": "Risks", "points": [f"r{i}" for i in range(9)]},  # capped at 6
        {"title": "", "points": ["no title"]},
        "garbage",
        {"title": "A"}, {"title": "B", "points": ["b"]}, {"title": "C", "points": ["c"]},
        {"title": "D", "points": ["d"]}, {"title": "E", "points": ["e"]},
    ]})
    d = dg.get_digest("u", 1, "IC case study")
    titles = [s["title"] for s in d["sections"]]
    assert titles == ["Thesis", "Risks", "B", "C", "D"]  # dup-only, untitled, malformed dropped; max 5
    assert len(d["sections"][1]["points"]) == 6
    assert d["organised"] is True


def test_written_once_then_served_from_cache_until_notes_change(monkeypatch, store):
    notes = list(BIG_NOTES)
    _notes(monkeypatch, notes)
    calls = _llm(monkeypatch, {"sections": [{"title": "T", "points": ["p"]}]})
    dg.get_digest("u", 1, "X")
    dg.get_digest("u", 1, "X")
    assert len(calls) == 1 and store  # second view: no model call
    notes[0] = _note(0, "- point 0a changed\n- point 0b")
    dg.get_digest("u", 1, "X")
    assert len(calls) == 2  # an edited note invalidates it


def test_budget_short_gives_plain_points_and_does_not_cache(monkeypatch, store):
    _notes(monkeypatch, BIG_NOTES)
    calls = _llm(monkeypatch, {"sections": [{"title": "T", "points": ["p"]}]})
    monkeypatch.setattr(dg.llm_budget, "can_spend", lambda m, t: False)
    d = dg.get_digest("u", 1, "X")
    assert calls == [] and d["organised"] is False and len(d["sections"][0]["points"]) == 8 and not store


def test_model_failure_falls_back_to_plain_points(monkeypatch, store, obs):
    _notes(monkeypatch, BIG_NOTES)

    def broken(model, **kw):
        raise ValueError("bad json")

    monkeypatch.setattr(dg.llm_budget, "chat", broken)
    monkeypatch.setattr(dg.llm_budget, "can_spend", lambda m, t: True)
    d = dg.get_digest("u", 1, "X")
    assert d["organised"] is False and d["sections"]
    assert obs.sent == []  # logged, not emailed


def test_input_is_capped_newest_first(monkeypatch, store):
    many = [_note(i, f"- note {i} " + "word " * 200) for i in range(30)]
    _notes(monkeypatch, many)
    calls = _llm(monkeypatch, {"sections": [{"title": "T", "points": ["p"]}]})
    dg.get_digest("u", 1, "X")
    sent = calls[0]["messages"][1]["content"]
    assert len(sent) < dg.INPUT_CHAR_CAP + 500
