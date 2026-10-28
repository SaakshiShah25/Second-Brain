"""observability.py: events carry the right user/request, never note text,
errors get reference codes and alerts, alerts are throttled, and a missing
app_event table degrades to memory instead of failing requests."""

import re

import db
from conftest import events


def test_events_carry_user_and_request_from_context(obs):
    tokens = obs.set_user("user-1")
    obs.record("llm", "extraction", model="m", tokens=120)
    obs.record("usage", "interactions_logged")
    obs.reset_user(tokens)
    obs.record("request", "GET /api/x")  # outside the request: no user, no request id

    llm, usage, outside = obs.recent_events()
    assert llm["user_id"] == usage["user_id"] == "user-1"
    assert llm["detail"]["req"] == usage["detail"]["req"]  # same request ties cost to the action
    assert outside["user_id"] is None and "req" not in outside["detail"]


def test_each_request_gets_its_own_id(obs):
    t1 = obs.set_user("u")
    obs.record("usage", "a")
    obs.reset_user(t1)
    t2 = obs.set_user("u")
    obs.record("usage", "b")
    obs.reset_user(t2)
    a, b = obs.recent_events()
    assert a["detail"]["req"] != b["detail"]["req"]


def test_explicit_user_overrides_context(obs):
    t = obs.set_user("ctx-user")
    obs.record("limit", "x", user_id="explicit")
    obs.reset_user(t)
    assert obs.recent_events()[0]["user_id"] == "explicit"


def test_error_messages_are_trimmed_to_first_line_and_never_include_model_output(obs):
    long = "Model did not return valid JSON. Raw output:\nMeeting with Priya about salary numbers\nsecret"
    assert "Priya" not in obs._clip(long)
    assert obs._clip("line one\nline two") == "line one"
    assert len(obs._clip("x" * 1000)) == 300
    assert obs._clip(None) == "" and obs._clip("") == ""


def test_error_returns_reference_code_records_and_alerts(obs):
    t = obs.set_user("u-9")
    code = obs.error("chat: reading your note", ValueError("boom"), status=500)
    obs.reset_user(t)
    assert re.fullmatch(r"[0-9A-F]{6}", code)
    (err,) = events("error")
    assert err["error_id"] == code and err["name"] == "chat: reading your note"
    assert err["detail"]["type"] == "ValueError" and err["detail"]["message"] == "boom"
    assert len(obs.sent) == 1
    to, subject, body = obs.sent[0]
    assert to == "admin@example.com" and "chat: reading your note" in subject and code in body


def test_error_without_alert(obs):
    obs.error("background thing", RuntimeError("x"), alert_admin=False)
    assert events("error") and obs.sent == []


def test_alerts_are_throttled_per_key_and_capped_per_day(obs, monkeypatch):
    assert obs.alert("k1", "s", "b") is True
    assert obs.alert("k1", "s", "b") is False  # same key within the cooldown
    assert obs.alert("k2", "s", "b") is True
    monkeypatch.setattr(obs, "ALERT_DAILY_CAP", 3)
    assert obs.alert("k3", "s", "b") is True  # third of three
    assert obs.alert("k4", "s", "b") is False  # cap reached
    assert len(obs.sent) == 3
    assert "Daily alert cap reached" in obs.sent[-1][2]  # the last one says so


def test_alert_cooldown_expires(obs, monkeypatch):
    now = [1_800_000_000.0]
    monkeypatch.setattr(obs.time, "time", lambda: now[0])
    assert obs.alert("k", "s", "b")
    now[0] += obs.ALERT_COOLDOWN + 1
    assert obs.alert("k", "s", "b")


def test_no_alert_email_configured_means_no_alert(obs, monkeypatch):
    monkeypatch.delenv("ALERT_EMAIL")
    assert obs.alert("k", "s", "b") is False and obs.sent == []


def test_alert_send_failure_never_raises(obs, monkeypatch):
    import email_client

    def broken(*a, **k):
        raise RuntimeError("resend down")

    monkeypatch.setattr(email_client, "send_email", broken)
    assert obs.alert("k", "s", "b") is True  # attempted; failure swallowed


def test_flush_writes_batches_and_falls_back_to_memory(obs, monkeypatch):
    written = []
    monkeypatch.setattr(db, "insert_app_events", lambda rows: written.extend(rows))
    obs.record("usage", "a")
    obs.record("usage", "b")
    obs.flush()
    assert [e["name"] for e in written] == ["a", "b"] and obs.persisted()

    def missing(rows):
        raise RuntimeError("Could not find the table 'public.app_event'")

    monkeypatch.setattr(db, "insert_app_events", missing)
    obs.record("usage", "c")
    obs.flush()
    assert not obs.persisted()
    assert [e["name"] for e in obs.recent_events()][-1] == "c"  # still visible in memory
