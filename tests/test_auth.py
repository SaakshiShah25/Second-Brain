"""Only a token Supabase rejects is "invalid or expired"; a connection problem is not the user's session.
Run: python tests/test_auth.py"""

import os
import sys
import types

import httpx
from fastapi import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from supabase_auth.errors import AuthApiError  # noqa: E402

import api.auth as auth  # noqa: E402

BEARER = "Bearer abc"


def _client(*outcomes):
    """A fake Supabase client whose get_user returns/raises each outcome in turn."""
    calls = {"n": 0, "resets": 0}

    def get_user(token):
        out = outcomes[min(calls["n"], len(outcomes) - 1)]
        calls["n"] += 1
        if isinstance(out, Exception):
            raise out
        return out

    auth.db = types.SimpleNamespace(
        get_client=lambda: types.SimpleNamespace(auth=types.SimpleNamespace(get_user=get_user)),
        reset_client=lambda: calls.__setitem__("resets", calls["resets"] + 1),
    )
    return calls


def _user(email="a@b.com"):
    return types.SimpleNamespace(user=types.SimpleNamespace(id="u1", email=email))


def test_a_valid_token_resolves_to_the_user():
    _client(_user())
    assert auth.get_current_user_id(BEARER) == "u1"


def test_a_token_supabase_rejects_is_a_401_and_is_not_retried():
    calls = _client(AuthApiError("invalid JWT: token is expired", 403, "bad_jwt"))
    try:
        auth.get_current_user_id(BEARER)
        assert False
    except HTTPException as e:
        assert e.status_code == 401 and e.detail == "Invalid or expired session"
    assert calls["n"] == 1 and calls["resets"] == 0


def test_a_connection_failure_is_retried_on_a_fresh_connection_and_can_succeed():
    calls = _client(httpx.ReadError("Resource temporarily unavailable"), _user())
    assert auth.get_current_user_id(BEARER) == "u1"
    assert calls["n"] == 2 and calls["resets"] == 1


def test_a_connection_that_keeps_failing_is_a_503_not_a_fake_logout():
    calls = _client(httpx.ConnectTimeout("timed out"))
    try:
        auth.get_current_user_id(BEARER)
        assert False
    except HTTPException as e:
        assert e.status_code == 503 and "try again" in e.detail and "expired" not in e.detail
    assert calls["n"] == 2


def test_a_supabase_server_error_is_treated_as_a_connection_problem():
    _client(AuthApiError("upstream error", 502, "unexpected_failure"))
    try:
        auth.get_current_user_id(BEARER)
        assert False
    except HTTPException as e:
        assert e.status_code == 503


def test_missing_header_is_a_401():
    try:
        auth.get_current_user_id(None)
        assert False
    except HTTPException as e:
        assert e.status_code == 401


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
