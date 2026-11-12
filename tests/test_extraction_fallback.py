"""extract_info's provider chain: Groq first, then NVIDIA, then Gemini (when enabled).

The real Groq/NVIDIA calls are replaced; what is checked is WHEN each one is used.
"""
import json
from types import SimpleNamespace

import pytest
from groq import APIConnectionError, RateLimitError

import extraction

GOOD = json.dumps({"keep_note": True, "groups": []})


def _rate_limit():
    return RateLimitError("rate limited", response=SimpleNamespace(status_code=429, headers={}, request=None), body=None)


class FakeProvider:
    def __init__(self, name, up=True, result=GOOD, fails=False):
        self.__name__, self.up, self.result, self.fails, self.calls = name, up, result, fails, 0

    def available(self):
        return self.up

    def generate_json(self, system_prompt, user_content, temperature=0.2):
        self.calls += 1
        if self.fails:
            raise RuntimeError("down")
        return self.result


@pytest.fixture
def setup(monkeypatch):
    state = SimpleNamespace(groq_calls=[], budget_ok=True, groq_raises=False)

    def fake_chat(model, retries=2, **kw):
        state.groq_calls.append(retries)
        if state.groq_raises:
            raise _rate_limit()
        msg = SimpleNamespace(content=json.dumps({"keep_note": True, "groups": [], "from": "groq"}))
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)])

    monkeypatch.setattr(extraction.llm_budget, "chat", fake_chat)
    monkeypatch.setattr(extraction.llm_budget, "can_spend", lambda model, tokens: state.budget_ok)
    nv, gem = FakeProvider("nvidia", up=False), FakeProvider("gemini", up=False)
    monkeypatch.setattr(extraction, "nvidia_client", nv)
    monkeypatch.setattr(extraction, "gemini_client", gem)
    state.nv, state.gem = nv, gem
    return state


def test_groq_used_normally_and_keeps_its_backoff_when_there_is_no_fallback(setup):
    out = extraction.extract_info("a note")
    assert out["from"] == "groq"
    assert setup.groq_calls == [2]  # unchanged behaviour without a fallback


def test_with_a_fallback_groq_is_tried_once_without_waiting(setup):
    setup.nv.up = True
    assert extraction.extract_info("a note")["from"] == "groq"
    assert setup.groq_calls == [0] and setup.nv.calls == 0


def test_second_person_in_the_same_minute_goes_to_nvidia(setup):
    # Groq refuses (tokens per minute) -> NVIDIA answers, the user never sees an error
    setup.nv.up, setup.groq_raises = True, True
    out = extraction.extract_info("a note")
    assert out == json.loads(GOOD)
    assert setup.groq_calls == [0] and setup.nv.calls == 1


def test_groq_being_down_also_goes_to_nvidia_but_without_one_it_still_errors(setup, monkeypatch):
    def down(model, retries=2, **kw):
        raise APIConnectionError(request=SimpleNamespace())

    monkeypatch.setattr(extraction.llm_budget, "chat", down)
    with pytest.raises(APIConnectionError):  # no fallback configured: unchanged behaviour
        extraction.extract_info("a note")
    setup.nv.up = True
    assert extraction.extract_info("a note") == json.loads(GOOD)


def test_known_exhausted_budget_skips_groq_entirely(setup):
    setup.nv.up, setup.budget_ok = True, False
    assert extraction.extract_info("a note") == json.loads(GOOD)
    assert setup.groq_calls == [] and setup.nv.calls == 1


def test_nvidia_down_falls_to_gemini_then_back_to_the_usual_error(setup):
    setup.nv.up, setup.nv.fails, setup.gem.up, setup.groq_raises = True, True, True, True
    assert extraction.extract_info("a note") == json.loads(GOOD)
    assert setup.nv.calls == 1 and setup.gem.calls == 1
    setup.gem.fails = True
    with pytest.raises(RateLimitError):  # callers turn this into the "usage limit" message
        extraction.extract_info("a note")


def test_exhausted_budget_and_every_fallback_failing_still_ends_in_the_usual_error(setup):
    setup.nv.up, setup.nv.fails, setup.budget_ok, setup.groq_raises = True, True, False, True
    with pytest.raises(RateLimitError):
        extraction.extract_info("a note")
    assert setup.groq_calls == [0]  # tried Groq last, once, so the normal error surfaces


def test_nvidia_client_is_on_with_a_key_and_can_be_switched_off(monkeypatch):
    import nvidia_client
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    assert not nvidia_client.available()
    monkeypatch.setenv("NVIDIA_API_KEY", "x")
    assert nvidia_client.available()
    monkeypatch.setenv("NVIDIA_FALLBACK", "off")
    assert not nvidia_client.available()


def test_nvidia_client_skips_a_model_that_fails_and_rejects_non_json(monkeypatch):
    import nvidia_client
    monkeypatch.setenv("NVIDIA_API_KEY", "x")
    monkeypatch.setenv("NVIDIA_MODELS", "m1,m2,m3")
    seen = []

    class Resp:
        def __init__(self, content=None, status=200):
            self.content, self.status = content, status

        def raise_for_status(self):
            if self.status >= 400:
                raise nvidia_client.requests.HTTPError("boom")

        def json(self):
            return {"choices": [{"message": {"content": self.content}}], "usage": {"total_tokens": 5300}}

    replies = {"m1": Resp(status=404), "m2": Resp(content="not json"), "m3": Resp(content=GOOD)}

    def fake_post(url, headers, json, timeout):
        seen.append((json["model"], json["chat_template_kwargs"]))
        return replies[json["model"]]

    monkeypatch.setattr(nvidia_client.requests, "post", fake_post)
    assert nvidia_client.generate_json("sys", "user") == GOOD
    assert [m for m, _ in seen] == ["m1", "m2", "m3"]
    assert all(k == {"enable_thinking": False} for _, k in seen)  # thinking off: seconds, not a minute
    replies["m3"] = Resp(status=500)
    with pytest.raises(RuntimeError):
        nvidia_client.generate_json("sys", "user")
