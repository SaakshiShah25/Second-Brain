"""Shared plumbing for the live evals: real credentials, token pacing under
Groq's per-minute limits, per-eval token accounting, and the dedicated eval
accounts (never a real user's data)."""

import json
import os
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")
os.environ.setdefault("ALLOWED_EMAILS", "")  # evals use their own accounts
# Never email the admin about deliberate eval failures.
os.environ["ALERT_EMAIL"] = ""

import db  # noqa: E402
import llm_budget  # noqa: E402
import observability  # noqa: E402

DATASETS = Path(__file__).resolve().parent / "datasets"
EVAL_EMAIL = "eval@myconfia.local"
EVAL_PASSWORD = os.environ.get("EVAL_PASSWORD", "Eval@12345-not-a-real-account")
LOAD_USERS = [f"load{i}@myconfia.local" for i in range(1, 11)]


def dataset(name: str) -> dict:
    return json.loads((DATASETS / f"{name}.json").read_text())


# ---------- results ----------

@dataclass
class Case:
    name: str
    passed: bool
    detail: str = ""
    tag: str = ""
    ms: float = 0.0


@dataclass
class Suite:
    name: str
    about: str = ""
    cases: list = field(default_factory=list)
    tokens: dict = field(default_factory=dict)  # model -> tokens this suite used
    calls: dict = field(default_factory=dict)  # model -> number of calls
    metrics: dict = field(default_factory=dict)
    notes: list = field(default_factory=list)
    skipped: str = ""

    @property
    def passed(self):
        return sum(c.passed for c in self.cases)

    @property
    def score(self):
        return self.passed / len(self.cases) if self.cases else None


class Meter:
    """Counts the LLM/Cohere calls made between start() and stop() - from
    observability's in-memory events, the same numbers the admin page uses."""

    def start(self):
        self._n = len(observability.recent_events())
        return self

    def stop(self, suite: Suite):
        new = observability.recent_events()[self._n:]
        tokens, calls = Counter(), Counter()
        for e in new:
            if e["kind"] == "llm":
                tokens[e["model"]] += e["tokens"] or 0
                calls[e["model"]] += 1
            elif e["kind"] == "cohere":
                calls[f"cohere:{e['name']}"] += 1
        suite.tokens, suite.calls = dict(tokens), dict(calls)
        return new


# ---------- pacing under Groq's per-minute token limit ----------

def pace(model: str, need: int) -> None:
    """Wait until `model` has `need` tokens left in its current minute
    (Groq free tier: ~8K/min), so evals measure the app, not the throttle."""
    state = llm_budget.snapshot().get(model) or {}
    remaining, reset_at = state.get("remaining"), state.get("reset_at", 0)
    now = time.time()
    if remaining is not None and remaining < need and reset_at > now:
        time.sleep(min(65, reset_at - now + 0.5))
    blocked = state.get("blocked_until", 0)
    if blocked > time.time():
        time.sleep(min(65, blocked - time.time() + 0.5))


def retry_on_limit(fn, *args, attempts=3, **kwargs):
    """Groq 429s are expected on the free tier - wait and retry instead of
    scoring the throttle as a wrong answer."""
    from groq import RateLimitError

    for i in range(attempts):
        try:
            return fn(*args, **kwargs)
        except RateLimitError as e:
            if "per day" in str(e).lower() or i == attempts - 1:
                raise
            time.sleep(20 + 10 * i)


# ---------- eval accounts ----------

def _admin():
    return db.get_client().auth.admin


def ensure_user(email: str, password: str = EVAL_PASSWORD) -> str:
    for u in _admin().list_users(per_page=1000):
        if u.email == email:
            _admin().update_user_by_id(u.id, {"password": password})
            return u.id
    return _admin().create_user({"email": email, "password": password, "email_confirm": True}).user.id


def sign_in(email: str, password: str = EVAL_PASSWORD) -> str:
    """A real access token through Supabase Auth, as the app gets one."""
    from supabase import create_client

    env = (ROOT / "frontend" / ".env.development").read_text()
    url = re.search(r"VITE_SUPABASE_URL=(\S+)", env).group(1)
    key = re.search(r"VITE_SUPABASE_(?:ANON|PUBLISHABLE)_KEY=(\S+)", env).group(1)
    return create_client(url, key).auth.sign_in_with_password({"email": email, "password": password}).session.access_token


def wipe_user_data(user_id: str) -> None:
    """Everything the eval account owns, so every run starts identical.
    Also resets its monthly usage counters, or repeated runs would hit the
    free caps and the evals would measure that instead."""
    c = db.get_client()
    for table in ("task", "interaction", "search_chunk", "initiative_digest", "initiative", "usage_counter", "daily_brief"):
        try:
            c.table(table).delete().eq("user_id", user_id).execute()
        except Exception:
            pass


def prepare_preferences(user_id: str) -> None:
    db.get_user_preference(user_id)
    c = db.get_client()
    fields = {"terms_accepted_at": "2026-01-01T00:00:00Z", "tour_completed_at": "2026-01-01T00:00:00Z"}
    try:
        c.table("user_preference").update(fields | {"usage_mode": "both"}).eq("user_id", user_id).execute()
    except Exception:
        c.table("user_preference").update(fields).eq("user_id", user_id).execute()


def words(text: str) -> int:
    return len(re.findall(r"\S+", text or ""))
