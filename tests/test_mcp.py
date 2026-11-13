"""The Claude connection: OAuth sign-in (PKCE, registration, refresh) and the MCP endpoint (tools, resources, auth).
Run: python -m pytest tests/test_mcp.py"""

import base64
import hashlib
import json
import os
import sys
import types
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["MCP_TOKEN_SECRET"] = "x" * 48
os.environ["FRONTEND_URL"] = "https://app.example.com"
os.environ["PUBLIC_BASE_URL"] = "https://api.example.com"
os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_KEY", "x")

import mcp_tokens as tokens  # noqa: E402
from api.main import app  # noqa: E402
from api import auth as auth_module  # noqa: E402
from api.routers import mcp as mcp_router  # noqa: E402

client = TestClient(app)
REDIRECT = "https://claude.ai/api/mcp/auth_callback"


def _challenge(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()


def _register(uris=(REDIRECT,)):
    r = client.post("/mcp/oauth/register", json={"redirect_uris": list(uris), "client_name": "Claude"})
    assert r.status_code == 201, r.text
    return r.json()["client_id"]


def _start(client_id, verifier="v" * 50, state="abc"):
    r = client.get("/mcp/oauth/authorize", params={
        "response_type": "code", "client_id": client_id, "redirect_uri": REDIRECT, "code_challenge": _challenge(verifier),
        "code_challenge_method": "S256", "state": state}, follow_redirects=False)
    return r


@pytest.fixture(autouse=True)
def _as_user(monkeypatch):
    """The person who is signed in on the MyConfía site (the consent page's own login)."""
    app.dependency_overrides[auth_module.get_current_user_id] = lambda: "user-1"
    yield
    app.dependency_overrides.clear()


def _full_flow(verifier="v" * 50):
    cid = _register()
    r = _start(cid, verifier)
    assert r.status_code == 302 and r.headers["location"].startswith("https://app.example.com/connect-claude?request=")
    req = parse_qs(urlparse(r.headers["location"]).query)["request"][0]
    approved = client.post("/mcp/oauth/approve", json={"request": req, "approve": True}).json()["redirect"]
    q = parse_qs(urlparse(approved).query)
    assert approved.startswith(REDIRECT) and q["state"] == ["abc"]
    return cid, q["code"][0], verifier


# ---------------------------------------------------------------- discovery and registration

def test_discovery_documents_point_at_this_server():
    pr = client.get("/.well-known/oauth-protected-resource/mcp").json()
    assert pr["resource"] == "https://api.example.com/mcp" and pr["authorization_servers"] == ["https://api.example.com"]
    asm = client.get("/.well-known/oauth-authorization-server").json()
    assert asm["authorization_endpoint"].endswith("/mcp/oauth/authorize") and asm["code_challenge_methods_supported"] == ["S256"]
    assert "none" in asm["token_endpoint_auth_methods_supported"]


def test_registration_only_accepts_safe_redirects():
    assert _register(["https://claude.ai/cb", "http://localhost:3000/cb"])
    for bad in ("http://evil.example.com/cb", "javascript:alert(1)", "https://x.com/cb#frag"):
        r = client.post("/mcp/oauth/register", json={"redirect_uris": [bad]})
        assert r.status_code == 400 and r.json()["error"] == "invalid_redirect_uri"


# ---------------------------------------------------------------- sign-in

def test_full_sign_in_gives_tokens_that_work_and_refresh():
    cid, code, verifier = _full_flow()
    r = client.post("/mcp/oauth/token", data={"grant_type": "authorization_code", "code": code, "client_id": cid, "redirect_uri": REDIRECT, "code_verifier": verifier})
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["token_type"] == "Bearer" and tokens.verify(t["access_token"], "mcp-access")["sub"] == "user-1"
    again = client.post("/mcp/oauth/token", data={"grant_type": "refresh_token", "refresh_token": t["refresh_token"], "client_id": cid})
    assert again.status_code == 200 and again.json()["access_token"]
    replay = client.post("/mcp/oauth/token", data={"grant_type": "refresh_token", "refresh_token": t["refresh_token"], "client_id": cid})
    assert replay.status_code == 400 and replay.json()["error"] == "invalid_grant"   # a refresh token works once


def test_a_code_cannot_be_used_twice_or_without_the_pkce_secret():
    cid, code, verifier = _full_flow()
    wrong = client.post("/mcp/oauth/token", data={"grant_type": "authorization_code", "code": code, "client_id": cid, "redirect_uri": REDIRECT, "code_verifier": "w" * 50})
    assert wrong.status_code == 400
    ok = client.post("/mcp/oauth/token", data={"grant_type": "authorization_code", "code": code, "client_id": cid, "redirect_uri": REDIRECT, "code_verifier": verifier})
    assert ok.status_code == 200
    reused = client.post("/mcp/oauth/token", data={"grant_type": "authorization_code", "code": code, "client_id": cid, "redirect_uri": REDIRECT, "code_verifier": verifier})
    assert reused.status_code == 400


def test_a_code_is_bound_to_its_client_and_redirect():
    cid, code, verifier = _full_flow()
    other = _register(["https://other.example.com/cb"])
    stolen = client.post("/mcp/oauth/token", data={"grant_type": "authorization_code", "code": code, "client_id": other, "code_verifier": verifier})
    assert stolen.status_code == 400
    moved = client.post("/mcp/oauth/token", data={"grant_type": "authorization_code", "code": code, "client_id": cid, "redirect_uri": "https://evil.example.com", "code_verifier": verifier})
    assert moved.status_code == 400


def test_authorize_refuses_unknown_clients_unregistered_redirects_and_missing_pkce():
    assert _start("not-a-client").status_code == 400
    cid = _register()
    r = client.get("/mcp/oauth/authorize", params={"response_type": "code", "client_id": cid, "redirect_uri": "https://evil.example.com/cb", "code_challenge": "x", "code_challenge_method": "S256"}, follow_redirects=False)
    assert r.status_code == 400
    r = client.get("/mcp/oauth/authorize", params={"response_type": "code", "client_id": cid, "redirect_uri": REDIRECT, "state": "s"}, follow_redirects=False)
    assert r.status_code == 302 and "error=invalid_request" in r.headers["location"] and r.headers["location"].startswith(REDIRECT)


def test_declining_sends_access_denied_back():
    cid = _register()
    req = parse_qs(urlparse(_start(cid).headers["location"]).query)["request"][0]
    back = client.post("/mcp/oauth/approve", json={"request": req, "approve": False}).json()["redirect"]
    assert "error=access_denied" in back and "code=" not in back


def test_tokens_are_not_interchangeable_or_forgeable():
    cid = _register()
    assert tokens.verify(cid, "mcp-access") is None                      # a client id is not an access token
    good = tokens.sign({"typ": "mcp-access", "sub": "u"}, 60)
    assert tokens.verify(good, "mcp-access")
    assert tokens.verify(good[:-2] + "xx", "mcp-access") is None          # tampered
    assert tokens.verify(tokens.sign({"typ": "mcp-access", "sub": "u"}, -5), "mcp-access") is None   # expired


def test_without_a_secret_the_feature_is_off(monkeypatch):
    monkeypatch.setenv("MCP_TOKEN_SECRET", "short")
    assert client.get("/.well-known/oauth-protected-resource").status_code == 404
    assert client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"}).status_code == 404


# ---------------------------------------------------------------- the MCP endpoint

def _token():
    return tokens.sign({"typ": "mcp-access", "sub": "user-1", "aud": "https://api.example.com/mcp"}, 600)


def _rpc(method, params=None, token=None, id=1):
    headers = {"Authorization": f"Bearer {token or _token()}"}
    return client.post("/mcp", json={"jsonrpc": "2.0", "id": id, "method": method, "params": params or {}}, headers=headers)


@pytest.fixture(autouse=True)
def _invited(monkeypatch):
    monkeypatch.setattr(mcp_router, "_still_invited", lambda uid: True)


def test_mcp_without_a_token_is_401_and_says_where_to_sign_in():
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"})
    assert r.status_code == 401
    assert 'resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp"' in r.headers["www-authenticate"]


def test_a_token_for_another_server_or_a_garbage_token_is_refused(monkeypatch):
    from fastapi import HTTPException

    def reject(authorization):  # what Supabase says to a token it has never seen
        raise HTTPException(401, "Invalid or expired session")

    monkeypatch.setattr(mcp_router, "get_current_user_id", reject)
    other = tokens.sign({"typ": "mcp-access", "sub": "u", "aud": "https://elsewhere.example.com/mcp"}, 60)
    assert _rpc("ping", token=other).status_code == 401
    assert _rpc("ping", token="garbage").status_code == 401


def test_a_plain_myconfia_session_token_also_works(monkeypatch):
    monkeypatch.setattr(mcp_router, "get_current_user_id", lambda authorization: "user-9")
    assert _rpc("ping", token="a-supabase-session-token").json()["result"] == {}


def test_a_person_removed_from_the_invite_list_is_locked_out(monkeypatch):
    monkeypatch.setattr(mcp_router, "_still_invited", lambda uid: False)
    assert _rpc("ping").status_code == 403


def test_initialize_tools_and_resources():
    init = _rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}}).json()["result"]
    assert init["protocolVersion"] == "2025-06-18" and init["serverInfo"]["name"] == "MyConfía" and "tools" in init["capabilities"]
    tools = {t["name"]: t for t in _rpc("tools/list").json()["result"]["tools"]}
    assert {"show_today", "capture", "ask_confia", "add_task", "update_task", "delete_task", "open_space"} <= set(tools)
    assert tools["show_today"]["_meta"]["ui"]["resourceUri"] == "ui://confia/today"
    assert tools["delete_task"]["annotations"]["destructiveHint"] is True and "_meta" not in tools["delete_task"]
    assert all(t["inputSchema"]["type"] == "object" for t in tools.values())
    res = _rpc("resources/list").json()["result"]["resources"]
    assert {r["uri"] for r in res} >= {"ui://confia/today", "ui://confia/spaces", "ui://confia/task"}
    page = _rpc("resources/read", {"uri": "ui://confia/today"}).json()["result"]["contents"][0]
    assert page["mimeType"] == "text/html;profile=mcp-app" and "ui/initialize" in page["text"] and "<html" in page["text"]
    assert "error" in _rpc("resources/read", {"uri": "ui://confia/nope"}).json()


def test_notifications_get_no_answer_and_batches_work():
    r = client.post("/mcp", json={"jsonrpc": "2.0", "method": "notifications/initialized"}, headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 202
    r = client.post("/mcp", json=[{"jsonrpc": "2.0", "id": 1, "method": "ping"}, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}], headers={"Authorization": f"Bearer {_token()}"})
    assert [a["id"] for a in r.json()] == [1, 2]
    assert _rpc("nope").json()["error"]["code"] == -32601


# ---------------------------------------------------------------- tools (against an in-memory account)

class _Db:
    def __init__(self):
        self.tasks = {1: {"id": 1, "description": "Pay rent", "status": "open", "due_date": "2000-01-01", "due_time": None, "priority": "high", "initiative_id": 7, "user_id": "user-1"},
                      2: {"id": 2, "description": "Call Rahul", "status": "open", "due_date": None, "due_time": None, "priority": "normal", "initiative_id": None, "user_id": "user-1"}}
        self.deleted = []

    def get_initiatives(self, uid):
        return [{"id": 7, "name": "Home", "color": None}]

    def get_all_tasks_with_context(self, uid, status=None):
        return list(self.tasks.values())

    def get_task(self, uid, tid):
        if tid not in self.tasks:
            raise KeyError(tid)
        return self.tasks[tid]

    def get_push_subscriptions(self, uid=None):
        return []

    def get_lists(self, uid):
        return []

    def get_all_interactions_with_context(self, uid):
        return [{"id": 5, "initiative_id": 7, "date": "2026-11-01", "summary": "Rent is due monthly", "raw_text": "rent", "initiative": {"name": "Home"}}]


@pytest.fixture
def fake(monkeypatch):
    import mcp_tools
    f = _Db()
    monkeypatch.setattr(mcp_tools, "db", f)
    monkeypatch.setattr(mcp_tools.tasks_router, "delete_task", lambda tid, user_id: f.deleted.append(tid) or {"ok": True})
    return f


def _call(name, args=None):
    return _rpc("tools/call", {"name": name, "arguments": args or {}}).json()["result"]


def test_show_today_puts_the_overdue_one_first_and_returns_data_for_the_view(fake):
    out = _call("show_today", {"timezone": "UTC"})
    assert out["isError"] is False and "Overdue" in out["content"][0]["text"] and "Pay rent" in out["content"][0]["text"]
    data = out["structuredContent"]
    assert data["view"] == "today" and [t["id"] for t in data["overdue"]] == [1] and [t["id"] for t in data["anytime"]] == [2]
    assert data["overdue"][0]["space"] == "Home" and data["overdue"][0]["priority"] == "high"


def test_deleting_needs_an_explicit_confirm(fake):
    out = _call("delete_task", {"task_id": 1})
    assert out["isError"] is True and "confirm" in out["content"][0]["text"] and fake.deleted == []
    out = _call("delete_task", {"task_id": 1, "confirm": True})
    assert out["isError"] is False and fake.deleted == [1]


def test_a_problem_comes_back_as_a_tool_error_not_a_crash(fake):
    out = _call("show_task", {"task_id": 999})
    assert out["isError"] is True and "999" in out["content"][0]["text"]
    out = _call("open_space", {"space": "Nowhere"})
    assert out["isError"] is True and "Home" in out["content"][0]["text"]      # tells Claude which spaces exist
    assert _rpc("tools/call", {"name": "nope"}).json()["error"]["code"] == -32602


def test_open_space_lists_its_notes_and_todos(fake):
    out = _call("open_space", {"space": "home"})
    sel = out["structuredContent"]["selected"]
    assert sel["space"]["name"] == "Home" and [n["id"] for n in sel["notes"]] == [5] and [t["id"] for t in sel["todos"]] == [1]


# ---------------------------------------------------------------- disconnecting

def test_disconnect_cuts_off_tokens_issued_before_it(monkeypatch):
    import time
    revoked = {"at": 0}
    monkeypatch.setattr(mcp_router.db, "get_mcp_revoked_at", lambda uid: revoked["at"])
    mcp_router._revoked.clear()
    cid, code, verifier = _full_flow()
    t = client.post("/mcp/oauth/token", data={"grant_type": "authorization_code", "code": code, "client_id": cid, "redirect_uri": REDIRECT, "code_verifier": verifier}).json()
    assert _rpc("ping", token=t["access_token"]).status_code == 200

    monkeypatch.setattr(mcp_router.db, "revoke_mcp", lambda uid: revoked.update(at=int(time.time()) + 5))
    assert client.post("/mcp/oauth/disconnect").json() == {"ok": True}
    assert _rpc("ping", token=t["access_token"]).status_code == 401                     # the access token no longer works
    again = client.post("/mcp/oauth/token", data={"grant_type": "refresh_token", "refresh_token": t["refresh_token"], "client_id": cid})
    assert again.status_code == 400 and "disconnected" in again.json()["error_description"]   # nor can it be refreshed


def test_disconnect_says_to_run_the_migration_when_it_cannot_save(monkeypatch):
    def boom(uid):
        raise RuntimeError("column does not exist")
    monkeypatch.setattr(mcp_router.db, "revoke_mcp", boom)
    r = client.post("/mcp/oauth/disconnect")
    assert r.status_code == 503 and "migration_48" in r.json()["detail"]
