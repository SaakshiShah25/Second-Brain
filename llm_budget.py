"""
llm_budget.py — Knows how much Groq budget is left, so callers can pick a
cheaper path BEFORE hitting a rate limit instead of after.

Groq's free tier gives each model 8K tokens/minute and 200K tokens/day,
shared by every user of the app (see console.groq.com/docs/rate-limits).
Every completion goes through chat() below, which:
  * records x-ratelimit-remaining-tokens / reset from the response headers
    (the per-minute window) and a local per-day token tally (Groq doesn't
    expose the daily remainder in headers);
  * on a 429, marks that model unavailable until Groq says it resets, and
    re-raises so the caller can fall back - with `retries=0` there is no
    silent 20-40 s backoff (the Groq SDK's default), which matters on
    interactive paths that have a cheaper alternative;
  * passes `reasoning_effort` through - gpt-oss models bill their hidden
    reasoning as output tokens, and "low" cuts that 3-4x on
    classification-style calls (measured: intent 125 -> 33 tokens).

can_spend(model, tokens) is what callers consult (see agent.py).
State is per process - fine for the single Render instance this runs on.
"""

import re
import threading
import time
from datetime import datetime, timezone

from groq import RateLimitError

from llm_client import get_client

DAILY_TOKEN_LIMIT = 200_000
_lock = threading.Lock()
_state: dict = {}   # model -> {"remaining": int, "reset_at": float, "blocked_until": float, "day": str, "used_today": int}


def _model_state(model: str) -> dict:
    today = datetime.now(timezone.utc).date().isoformat()
    s = _state.setdefault(model, {"remaining": None, "reset_at": 0.0, "blocked_until": 0.0, "day": today, "used_today": 0})
    if s["day"] != today:
        s.update(day=today, used_today=0)
    return s


def _seconds(value) -> float:
    """Groq reset values look like '6.25s', '1m2.5s', '850ms'."""
    if not value:
        return 0.0
    total = 0.0
    for num, unit in re.findall(r"([\d.]+)(ms|h|m|s)", str(value)):
        total += float(num) * {"ms": 0.001, "s": 1, "m": 60, "h": 3600}[unit]
    return total


def can_spend(model: str, tokens: int) -> bool:
    """Whether a call needing about `tokens` should go ahead now."""
    with _lock:
        s = _model_state(model)
        now = time.time()
        if now < s["blocked_until"]:
            return False
        if s["used_today"] + tokens > DAILY_TOKEN_LIMIT:
            return False
        if s["remaining"] is not None and now < s["reset_at"] and s["remaining"] < tokens:
            return False
        return True


def snapshot() -> dict:
    with _lock:
        return {m: {k: v for k, v in _model_state(m).items()} for m in list(_state)}


def chat(model: str, retries: int = 2, **kwargs):
    """chat.completions.create with budget bookkeeping. Raises RateLimitError
    (after marking the model blocked) when Groq refuses."""
    client = get_client().with_options(max_retries=retries)
    try:
        raw = client.chat.completions.with_raw_response.create(model=model, **kwargs)
    except RateLimitError as e:
        retry_after = _seconds(getattr(e, "response", None) and e.response.headers.get("retry-after"))
        daily = "per day" in str(e).lower() or "tpd" in str(e).lower()
        with _lock:
            s = _model_state(model)
            s["blocked_until"] = time.time() + (retry_after or (3600 if daily else 60))
            if daily:
                s["used_today"] = DAILY_TOKEN_LIMIT
        raise
    resp = raw.parse()
    with _lock:
        s = _model_state(model)
        rem = raw.headers.get("x-ratelimit-remaining-tokens")
        if rem is not None:
            s["remaining"] = int(float(rem))
            s["reset_at"] = time.time() + _seconds(raw.headers.get("x-ratelimit-reset-tokens"))
        usage = getattr(resp, "usage", None)
        if usage:
            cached = getattr(getattr(usage, "prompt_tokens_details", None), "cached_tokens", 0) or 0
            s["used_today"] += max(0, usage.prompt_tokens - cached) + usage.completion_tokens
    return resp
