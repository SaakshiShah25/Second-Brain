"""Shared fixtures for the offline test suite. Nothing here talks to Groq,
Cohere, Supabase or Resend - every external call is replaced, and the
replacements are undone after each test (monkeypatch), so tests can't leak
state into each other.

Run everything:  python -m pytest -q tests
"""

import os
import sys

# Before ANY app module loads: dummy credentials, so a test can never reach
# the real Supabase/Groq/Cohere/Resend even if a stub is missed. load_dotenv()
# (api/main.py) does not override variables that are already set.
_SAFE_ENV = {
    "GROQ_API_KEY": "test-groq", "SUPABASE_URL": "http://127.0.0.1:9", "SUPABASE_KEY": "test-supabase",
    "COHERE_API_KEY": "", "GEMINI_API_KEY": "", "RESEND_API_KEY": "", "RESEND_FROM_EMAIL": "",
    "GOOGLE_MAPS_API_KEY": "", "ALERT_EMAIL": "", "ADMIN_EMAILS": "", "ALLOWED_EMAILS": "", "SENTRY_DSN": "",
    "APP_ENV": "test", "CRON_SECRET": "test-cron", "FRONTEND_URL": "https://app.example.com",
    "ENCRYPTION_KEY": "1Bq2y7m0rJ7gq1Yy1qk3Fz6l1W5y8l6m0dJb3o0yC5E=",
}
os.environ.update(_SAFE_ENV)

import pytest  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import observability  # noqa: E402

# Events recorded during tests stay in memory - no background writer.
observability._worker_started = True


@pytest.fixture
def obs(monkeypatch):
    """A clean observability module: empty buffers, no background flush
    thread, and alert emails captured in a list instead of sent."""
    sent = []
    monkeypatch.setattr(observability, "_pending", [])
    monkeypatch.setattr(observability, "_recent", observability.deque(maxlen=observability.MEMORY_EVENTS))
    monkeypatch.setattr(observability, "_worker_started", True)  # no flush thread in tests
    monkeypatch.setattr(observability, "_last_alert", {})
    monkeypatch.setattr(observability, "_alert_day", {"day": None, "count": 0})
    monkeypatch.setattr(observability, "_table_ok", True)
    monkeypatch.setenv("ALERT_EMAIL", "admin@example.com")

    monkeypatch.setattr(observability, "_spawn", lambda fn: fn())  # send alerts inline
    import email_client

    monkeypatch.setattr(email_client, "send_email", lambda to, subject, body, html=None: sent.append((to, subject, body)))
    observability.sent = sent
    yield observability
    del observability.sent


def events(kind=None, name=None):
    return [e for e in observability.recent_events()
            if (kind is None or e["kind"] == kind) and (name is None or e["name"] == name)]
