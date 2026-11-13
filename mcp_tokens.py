"""
mcp_tokens.py - the signed tokens behind "Connect MyConfía to Claude" (api/routers/mcp_oauth.py, api/routers/mcp.py).

Everything the connection needs to remember is carried inside a signed token, so the server stores nothing and any
backend instance can check any token:

    client      the app Claude registers itself as (its allowed redirect addresses)        valid ~1 year
    request     one sign-in request, carried to the consent page and back                  valid 10 minutes
    code        the one-time code Claude trades for tokens                                 valid 2 minutes
    access      what Claude sends with every /mcp call                                     valid 1 hour
    refresh     lets Claude get a new access token without asking you again                valid 60 days

Tokens are HS256 JWTs signed with MCP_TOKEN_SECRET (a long random value only the backend knows). Without that secret the
whole feature is off - there is deliberately no default. Rotating the secret signs everyone out of Claude at once.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from typing import Optional

SCOPE = "confia"
ACCESS_TTL = 3600
REFRESH_TTL = 60 * 24 * 3600
CODE_TTL = 120
REQUEST_TTL = 600
CLIENT_TTL = 365 * 24 * 3600


def _secret() -> bytes:
    return os.environ.get("MCP_TOKEN_SECRET", "").encode()


def enabled() -> bool:
    """The feature is on only when a long enough secret is set."""
    return len(_secret()) >= 32


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign(payload: dict, ttl: int, now: Optional[float] = None) -> str:
    """A signed token carrying `payload`, valid for `ttl` seconds."""
    if not enabled():
        raise RuntimeError("MCP_TOKEN_SECRET is not set")
    now = time.time() if now is None else now
    body = {**payload, "iat": int(now), "exp": int(now + ttl)}
    head = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    data = _b64(json.dumps(body, separators=(",", ":")).encode())
    mac = hmac.new(_secret(), f"{head}.{data}".encode(), hashlib.sha256).digest()
    return f"{head}.{data}.{_b64(mac)}"


def verify(token: str, typ: str, now: Optional[float] = None) -> Optional[dict]:
    """The payload when `token` is genuine, unexpired and of kind `typ`; otherwise None (never raises)."""
    try:
        if not enabled() or not token or token.count(".") != 2:
            return None
        head, data, mac = token.split(".")
        expected = hmac.new(_secret(), f"{head}.{data}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _unb64(mac)):
            return None
        if json.loads(_unb64(head)).get("alg") != "HS256":
            return None
        payload = json.loads(_unb64(data))
        if payload.get("typ") != typ:
            return None
        if payload.get("exp", 0) <= (time.time() if now is None else now):
            return None
        return payload
    except Exception:  # noqa: BLE001 - anything unreadable is simply "not valid"
        return None


def pkce_challenge(verifier: str) -> str:
    """The S256 code challenge for a verifier (RFC 7636)."""
    return _b64(hashlib.sha256(verifier.encode()).digest())


def new_id() -> str:
    return secrets.token_urlsafe(16)


# One-time use of codes and refresh tokens, best effort: remembered in this process until they would have expired
# anyway. (A second backend instance would not know - the short lifetimes and the PKCE check are the real protection.)
_used: dict = {}
_used_lock = threading.Lock()


def use_once(jti: str, ttl: int) -> bool:
    """True the first time `jti` is presented, False when it was already used."""
    now = time.time()
    with _used_lock:
        for k in [k for k, exp in _used.items() if exp <= now]:
            del _used[k]
        if jti in _used:
            return False
        _used[jti] = now + ttl
        return True
