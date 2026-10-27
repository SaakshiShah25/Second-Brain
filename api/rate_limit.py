"""
api/rate_limit.py — the shared slowapi Limiter instance.

Lives in its own module (rather than directly on api/main.py's `app`) so
individual routers (api/routers/chat.py, capture.py) can import and
decorate their own endpoints with a stricter limit than the global
default, without a circular import back to api/main.py (which imports
those routers at startup, before it could otherwise hand a limiter back
to them).

Limits are counted per USER (the `sub` of their access token), not per IP:
behind Render's proxy many people can share one address, and one person's
burst shouldn't throttle everyone. The token is only read here to pick a
bucket - api/auth.py still verifies it on every request. Requests without
a token fall back to the client IP (uvicorn runs with --proxy-headers, so
that is the real caller, not the proxy).
"""

import base64
import json

from slowapi import Limiter
from slowapi.util import get_remote_address


def token_subject(request):
    """The user id inside the request's access token, WITHOUT verifying it -
    only for picking a rate-limit bucket and labelling analytics events.
    Access itself is always checked by api/auth.py."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        try:
            payload = auth.removeprefix("Bearer ").split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
            return claims.get("sub") or None
        except (IndexError, ValueError, AttributeError):
            pass
    return None


def _user_or_ip(request) -> str:
    sub = token_subject(request)
    return f"user:{sub}" if sub else f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=_user_or_ip, default_limits=["60/minute"])
