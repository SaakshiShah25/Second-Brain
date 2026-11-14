"""Tests must never touch the real app: no events written to the admin dashboard's table, no emails to the admin,
no database. (A test that imports api.main loads .env, and observability would then flush its fake events - models
called "m1", "m3" - into the live app_event table, where they showed up as "nvidia fallback failed x30".)"""
import os

import pytest

# Set before anything imports db/observability; load_dotenv() never overrides a variable that is already set.
os.environ["ALERT_EMAIL"] = ""
os.environ["RESEND_API_KEY"] = ""
os.environ["SUPABASE_URL"] = "http://127.0.0.1:9"
os.environ["SUPABASE_KEY"] = "test-key-not-real"
os.environ["SUPABASE_SERVICE_KEY"] = "test-key-not-real"


@pytest.fixture(autouse=True)
def _no_event_persistence(monkeypatch):
    import observability

    monkeypatch.setattr(observability, "_ensure_worker", lambda: None)  # events stay in memory, nothing is flushed
    yield
    observability._pending.clear()
