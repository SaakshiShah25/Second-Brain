"""llm_budget.py: every Groq call is counted against the right model and
feature, Groq's own limit headers are kept, 429s block the model and are
recorded as limits, and the admin is alerted at 80% and at the daily limit."""

import types

import httpx
import pytest
from groq import RateLimitError

import llm_budget
from conftest import events


class _Raw:
    def __init__(self, prompt, completion, headers):
        self.headers = headers
        self._resp = types.SimpleNamespace(
            usage=types.SimpleNamespace(prompt_tokens=prompt, completion_tokens=completion, prompt_tokens_details=None),
            choices=[types.SimpleNamespace(message=types.SimpleNamespace(content="{}"))],
        )

    def parse(self):
        return self._resp


def _fake_client(monkeypatch, outcome):
    def create(model, **kwargs):
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    completions = types.SimpleNamespace(with_raw_response=types.SimpleNamespace(create=create))
    client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=completions))
    client.with_options = lambda **k: client
    monkeypatch.setattr(llm_budget, "get_client", lambda: client)


@pytest.fixture
def budget(monkeypatch, obs):
    monkeypatch.setattr(llm_budget, "_state", {})
    return llm_budget


HEADERS = {
    "x-ratelimit-remaining-tokens": "7200", "x-ratelimit-reset-tokens": "6s",
    "x-ratelimit-limit-tokens": "8000", "x-ratelimit-limit-requests": "1000", "x-ratelimit-remaining-requests": "998",
}


def test_call_is_counted_and_recorded_with_feature_from_caller(budget, monkeypatch):
    _fake_client(monkeypatch, _Raw(300, 50, HEADERS))
    budget.chat("model-a", messages=[])
    state = budget.snapshot()["model-a"]
    assert state["used_today"] == 350
    assert state["remaining"] == 7200 and state["limit_tpm"] == 8000
    assert state["limit_rpd"] == 1000 and state["remaining_rpd"] == 998
    (e,) = events("llm")
    assert e["model"] == "model-a" and e["tokens"] == 350
    assert e["name"] == "test_llm_budget"  # the calling module = the feature
    assert e["detail"]["prompt"] == 300 and e["detail"]["completion"] == 50


def test_explicit_feature_wins_over_caller(budget, monkeypatch, obs):
    _fake_client(monkeypatch, _Raw(10, 5, {}))
    token = obs.set_feature("capture")
    budget.chat("m", messages=[])
    obs._feature.reset(token)
    assert events("llm")[0]["name"] == "capture"


def test_can_spend_respects_minute_window_daily_total_and_blocks(budget, monkeypatch):
    now = 1_800_000_000.0
    monkeypatch.setattr(budget.time, "time", lambda: now)
    s = budget._model_state("m")
    assert budget.can_spend("m", 4000)
    s.update(remaining=1000, reset_at=now + 30)
    assert not budget.can_spend("m", 4000)  # not enough left this minute
    s.update(remaining=None, used_today=budget.DAILY_TOKEN_LIMIT - 100)
    assert not budget.can_spend("m", 4000)  # would pass today's limit
    s.update(used_today=0, blocked_until=now + 10)
    assert not budget.can_spend("m", 10)  # blocked after a 429


def _rate_limit(message):
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    return RateLimitError(message, response=httpx.Response(429, request=request, headers={"retry-after": "7"}), body=None)


def test_per_minute_429_blocks_briefly_and_records_limit_without_alert(budget, monkeypatch, obs):
    _fake_client(monkeypatch, _rate_limit("Rate limit reached on tokens per minute (TPM)"))
    with pytest.raises(RateLimitError):
        budget.chat("m", messages=[])
    (lim,) = events("limit")
    assert lim["name"] == "groq_tokens_per_minute" and lim["model"] == "m"
    assert budget.snapshot()["m"]["blocked_until"] > 0
    assert obs.sent == []  # per-minute hits are routine - report only


def test_daily_429_marks_budget_exhausted_and_alerts(budget, monkeypatch, obs):
    _fake_client(monkeypatch, _rate_limit("Rate limit reached on tokens per day (TPD)"))
    with pytest.raises(RateLimitError):
        budget.chat("m", messages=[])
    assert events("limit")[0]["name"] == "groq_tokens_per_day"
    assert budget.snapshot()["m"]["used_today"] == budget.DAILY_TOKEN_LIMIT
    assert len(obs.sent) == 1 and "daily limit" in obs.sent[0][1].lower()


def test_alert_once_when_passing_80_percent(budget, monkeypatch, obs):
    budget._model_state("m")["used_today"] = int(budget.DAILY_TOKEN_LIMIT * 0.8) - 10
    _fake_client(monkeypatch, _Raw(100, 0, {}))
    budget.chat("m", messages=[])
    budget.chat("m", messages=[])
    assert len(obs.sent) == 1 and "80%" in obs.sent[0][1]
