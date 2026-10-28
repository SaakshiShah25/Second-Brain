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
import re

from fastapi import HTTPException, Request
from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter
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


# slowapi: only for routes with their own, stricter @limiter.limit(...)
# (chat, voice capture, client-error).
limiter = Limiter(key_func=_user_or_ip)

TOO_FAST = "You're sending requests faster than the app allows - wait a minute and try again."

# The default limit for every other API route. Applied as a dependency on
# each router (api/main.py), i.e. AFTER routing - slowapi's middleware is
# meant to do this, but with FastAPI's lazily included routers (0.13x+) it
# can't find the route, treats every route as exempt, and silently limits
# nothing (found by evals/load.py). Counted per user, per route.
DEFAULT_LIMIT = parse("60/minute")
_default_window = MovingWindowRateLimiter(MemoryStorage())


def route_label(request) -> str:
    """The URL path with ids replaced ("/api/notes/{id}"). Not the route's own
    `path`: inside an included router that is relative ("" for a root route)."""
    return re.sub(r"/\d+(?=/|$)", "/{id}", request.url.path)


def default_rate_limit(request: Request) -> None:
    route = route_label(request)
    if not _default_window.hit(DEFAULT_LIMIT, _user_or_ip(request), request.method, route):
        import observability

        observability.record("limit", "api_rate_limit", status=429, user_id=token_subject(request),
                             detail={"route": f"{request.method} {route}", "limit": "60 per 1 minute"})
        raise HTTPException(429, TOO_FAST)


def reset_limits() -> None:
    """Clears every counter (tests)."""
    limiter.reset()
    _default_window.storage.reset()
