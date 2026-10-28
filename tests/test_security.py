"""Access control and abuse protection: the invite list, per-user rate-limit
buckets, production CORS, and the opt-in-only Gemini fallback."""

import base64
import importlib
import json
import types

import pytest
from fastapi import HTTPException

import gemini_client
from api import auth
from api.rate_limit import _user_or_ip, token_subject
from conftest import events


@pytest.mark.parametrize("allow,email,ok", [
    ("", "anyone@x.com", True),  # unset = open (local dev)
    ("a@x.com", "a@x.com", True),
    ("a@x.com", "A@X.COM", True),  # case-insensitive
    ("a@x.com, b@y.com", "b@y.com", True),
    ("a@x.com", "c@x.com", False),
    ("@company.com", "dev@company.com", True),  # whole domain
    ("@company.com", "dev@evilcompany.com", False),  # ...but not a lookalike
    ("@company.com", "dev@company.com.evil.io", False),
    ("a@x.com", None, False),
    ("a@x.com", "", False),
])
def test_invite_list(monkeypatch, allow, email, ok):
    monkeypatch.setenv("ALLOWED_EMAILS", allow)
    assert auth.is_invited(email) is ok


def _supabase_user(monkeypatch, email, uid="uid-1"):
    user = types.SimpleNamespace(id=uid, email=email)
    client = types.SimpleNamespace(auth=types.SimpleNamespace(get_user=lambda token: types.SimpleNamespace(user=user)))
    monkeypatch.setattr(auth.db, "get_client", lambda: client)


def test_uninvited_account_gets_403_and_admin_is_told_once(monkeypatch, obs):
    monkeypatch.setenv("ALLOWED_EMAILS", "boss@x.com")
    _supabase_user(monkeypatch, "stranger@y.com")
    for _ in range(2):
        with pytest.raises(HTTPException) as e:
            auth.get_current_user_id("Bearer t")
        assert e.value.status_code == 403 and e.value.detail == "invite_only"
    assert len(events("limit", "not_invited")) == 2
    assert len(obs.sent) == 1 and "stranger@y.com" in obs.sent[0][2]


def test_invited_account_passes(monkeypatch, obs):
    monkeypatch.setenv("ALLOWED_EMAILS", "boss@x.com")
    _supabase_user(monkeypatch, "boss@x.com", uid="boss-id")
    assert auth.get_current_user_id("Bearer t") == "boss-id"


@pytest.mark.parametrize("header", [None, "", "Basic abc", "Bearer"])
def test_missing_or_malformed_auth_header_is_401(header):
    with pytest.raises(HTTPException) as e:
        auth.get_current_user_id(header)
    assert e.value.status_code == 401


def test_invalid_token_is_401(monkeypatch):
    def bad(token):
        raise RuntimeError("jwt expired")

    monkeypatch.setattr(auth.db, "get_client", lambda: types.SimpleNamespace(auth=types.SimpleNamespace(get_user=bad)))
    with pytest.raises(HTTPException) as e:
        auth.get_current_user_id("Bearer expired")
    assert e.value.status_code == 401


def _req(auth_header=None, host="9.9.9.9"):
    headers = {"authorization": auth_header} if auth_header else {}
    return types.SimpleNamespace(headers=headers, client=types.SimpleNamespace(host=host))


def _jwt(claims):
    body = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"Bearer header.{body}.sig"


def test_rate_limit_buckets_are_per_user_then_ip():
    assert token_subject(_req(_jwt({"sub": "abc"}))) == "abc"
    assert _user_or_ip(_req(_jwt({"sub": "abc"}))) == "user:abc"
    # two users behind the same proxy IP get separate buckets
    assert _user_or_ip(_req(_jwt({"sub": "u1"}), "1.1.1.1")) != _user_or_ip(_req(_jwt({"sub": "u2"}), "1.1.1.1"))
    for broken in [None, "Bearer junk", "Bearer a.%%%.c", _jwt({"no": "sub"})]:
        assert token_subject(_req(broken)) is None
        assert _user_or_ip(_req(broken)) == "ip:9.9.9.9"


def _cors_origins(monkeypatch, env, frontend):
    monkeypatch.setenv("APP_ENV", env)
    monkeypatch.setenv("FRONTEND_URL", frontend)
    import api.main as main

    main = importlib.reload(main)
    cors = next(m for m in main.app.user_middleware if m.cls.__name__ == "CORSMiddleware")
    return cors.kwargs["allow_origins"]


def test_production_cors_only_allows_the_real_frontend(monkeypatch):
    try:
        prod = _cors_origins(monkeypatch, "production", "https://app.example.com/, https://www.example.com")
        assert prod == ["https://app.example.com", "https://www.example.com"]
        dev = _cors_origins(monkeypatch, "development", "https://app.example.com")
        assert "http://localhost:5173" in dev and "https://app.example.com" in dev
    finally:
        monkeypatch.setenv("APP_ENV", "test")
        import api.main as main

        importlib.reload(main)


def test_gemini_fallback_needs_explicit_opt_in(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "key")
    monkeypatch.delenv("GEMINI_FALLBACK", raising=False)
    assert not gemini_client.available()  # a key alone is not enough
    monkeypatch.setenv("GEMINI_FALLBACK", "on")
    assert gemini_client.available()
    monkeypatch.setenv("GEMINI_API_KEY", "")
    assert not gemini_client.available()
