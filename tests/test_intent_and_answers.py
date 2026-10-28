"""Routing safeguards that don't need the model: obvious questions skip the
LLM, a to-do is never refused as "out of scope", a classifier failure never
loses a note, and internal refs never leak into answers."""

import json
import types

import pytest

import agent
import intent


@pytest.mark.parametrize("text", ["What's overdue?", "who did I meet last week?", "When is the IC memo due?"])
def test_obvious_questions_skip_the_model(text):
    assert intent.fast_classify(text) == "ask"


@pytest.mark.parametrize("text", ["Send the deck by 6pm", "Call mom tonight"])
def test_obvious_self_todos_are_captured_without_the_model(text):
    assert intent.fast_classify(text) == "capture"


@pytest.mark.parametrize("text", ["Met Priya today", "what a day", "x" * 400, ""])
def test_everything_else_goes_to_the_model(text):
    assert intent.fast_classify(text) is None


def _model_says(monkeypatch, verdict):
    calls = []

    def chat(model, **kw):
        calls.append(kw["messages"][1]["content"])
        if isinstance(verdict, Exception):
            raise verdict
        content = json.dumps({"intent": verdict}) if verdict is not None else "not json"
        return types.SimpleNamespace(choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=content))])

    monkeypatch.setattr(intent.llm_budget, "chat", chat)
    return calls


@pytest.mark.parametrize("todo", [
    "Ask Priya for the fuel cost report draft by Friday",
    "Tell Rohan the demo moved to Monday",
    "Write the downside scenario for the IC memo",
    "Draw up the contract for Acme",
    "Summarize the call notes for the team",
    "Read chapter 5 of the fixed income book by Sunday",
    "Do the tax filing by Friday",
])
def test_a_todo_misread_as_out_of_scope_is_still_saved(monkeypatch, todo):
    _model_says(monkeypatch, "out_of_scope")
    assert intent.classify(todo) == "capture"


@pytest.mark.parametrize("request_", [
    "Write me a poem about bonds", "tell me a joke", "explain duration in bonds",
    "what is the capital of France", "can you translate this to Hindi", "give me a recipe for pasta",
    "who won the 2011 cricket world cup", "when did the Berlin wall fall", "is pluto a planet",
])
def test_real_assistant_requests_stay_out_of_scope(monkeypatch, request_):
    _model_says(monkeypatch, "out_of_scope")
    assert intent.classify(request_) == "out_of_scope"


@pytest.mark.parametrize("verdict", [RuntimeError("groq down"), None, "banana"])
def test_classifier_failure_defaults_to_saving_the_note(monkeypatch, verdict):
    _model_says(monkeypatch, verdict)
    assert intent.classify("Met Arjun about the launch") == "capture"


def test_empty_message_is_capture_without_a_model_call(monkeypatch):
    calls = _model_says(monkeypatch, "ask")
    assert intent.classify("   ") == "capture" and calls == []


@pytest.mark.parametrize("raw,clean", [
    ("- Finish the memo (task:17, due 2026-10-28)", "- Finish the memo (due 2026-10-28)"),
    ("See [note:12].", "See ."),
    ("Done (task:3)", "Done"),
    ("No refs here, just text.", "No refs here, just text."),
    ("Ratio 3:2 and time 10:30 stay", "Ratio 3:2 and time 10:30 stay"),
])
def test_internal_refs_are_stripped_from_answers(raw, clean):
    assert agent._strip_refs(raw).strip() == clean
