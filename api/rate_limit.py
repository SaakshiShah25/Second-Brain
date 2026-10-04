"""
api/rate_limit.py — the shared slowapi Limiter instance.

Lives in its own module (rather than directly on api/main.py's `app`) so
individual routers (api/routers/chat.py, capture.py) can import and
decorate their own endpoints with a stricter limit than the global
default, without a circular import back to api/main.py (which imports
those routers at startup, before it could otherwise hand a limiter back
to them).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
