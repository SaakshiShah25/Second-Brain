"""
observability.py — what happened, to whom, and what it cost. All free:
events go to the app's own Supabase (app_event, schema.sql section 35),
alerts go out by email through Resend (already used for the morning brief).

  record(kind, name, ...)  one event: an API request, an LLM/Cohere call
                           (model, tokens, which feature), a usage action
                           (capture/question), a limit being hit, or an
                           error. Buffered and written in batches by a
                           background thread, so a request never waits on
                           it. The last few thousand also stay in memory,
                           so the admin page works before the table exists.
  error(where, exc, ...)   records an error with a short reference code
                           (shown to the user, and in the alert email) and
                           emails the admin. Returns the code.
  alert(key, subject, ..)  emails ALERT_EMAIL, throttled: the same `key` at
                           most once per ALERT_COOLDOWN, and ALERT_DAILY_CAP
                           in total per day (Resend's free plan: 100/day).

Privacy: events never carry note or question text - only ids, counts,
timings, model names, and error types/messages (first line, trimmed).
The user an event belongs to comes from a context variable set per request
(api/main.py's middleware), so LLM calls deep inside a pipeline are
attributed without threading user_id through every function.
"""

import os
import secrets
import threading
import time
from collections import deque
from contextvars import ContextVar
from datetime import date, datetime, timezone

_user: ContextVar = ContextVar("obs_user", default=None)
_feature: ContextVar = ContextVar("obs_feature", default=None)
_request: ContextVar = ContextVar("obs_request", default=None)

FLUSH_SECONDS = 5
MEMORY_EVENTS = 5000
ALERT_COOLDOWN = 3600  # seconds between two alerts with the same key
ALERT_DAILY_CAP = 40

_lock = threading.Lock()
_pending: list = []
_recent: deque = deque(maxlen=MEMORY_EVENTS)
_table_ok = True
_table_retry_at = 0.0
_worker_started = False

_alert_lock = threading.Lock()
_last_alert: dict = {}
_alert_day = {"day": None, "count": 0}


# ---------- request context ----------

def set_user(user_id):
    """Start of a request: who it's for, plus a fresh request id that ties
    its LLM/Cohere calls to the capture or question they served."""
    return _user.set(user_id), _request.set(secrets.token_hex(6))


def reset_user(tokens) -> None:
    _user.reset(tokens[0])
    _request.reset(tokens[1])


def current_user():
    return _user.get()


def set_feature(name):
    """Which product feature the following LLM calls belong to (e.g.
    "capture", "question") - shown per feature on the admin page."""
    return _feature.set(name)


def current_feature():
    return _feature.get()


# ---------- events ----------

def _clip(text, n=300) -> str:
    first = str(text or "").strip().splitlines()[0] if str(text or "").strip() else ""
    # Model-output parse errors append the raw output after this marker - that
    # can be note content, so it never leaves the process.
    first = first.split("Raw output")[0]
    return first[:n]


def record(kind: str, name: str, *, status=None, duration_ms=None, model=None, tokens=None,
           error_id=None, detail=None, user_id=None) -> None:
    """kind: request | llm | cohere | usage | limit | error | client_error."""
    event = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_id": user_id if user_id is not None else current_user(),
        "kind": kind,
        "name": str(name)[:120],
        "status": status,
        "duration_ms": int(duration_ms) if duration_ms is not None else None,
        "model": model,
        "tokens": int(tokens) if tokens is not None else None,
        "error_id": error_id,
        "detail": {**(detail or {}), **({"req": _request.get()} if _request.get() else {})},
    }
    with _lock:
        _recent.append(event)
        _pending.append(event)
    _ensure_worker()


def recent_events() -> list:
    with _lock:
        return list(_recent)


def persisted() -> bool:
    return _table_ok


def _ensure_worker() -> None:
    global _worker_started
    if _worker_started:
        return
    with _lock:
        if _worker_started:
            return
        _worker_started = True
    threading.Thread(target=_flush_loop, daemon=True, name="obs-flush").start()


def _flush_loop() -> None:
    while True:
        time.sleep(FLUSH_SECONDS)
        flush()


def flush() -> None:
    global _table_ok, _table_retry_at
    with _lock:
        batch, _pending[:] = list(_pending), []
    if not batch:
        return
    if not _table_ok and time.time() < _table_retry_at:
        return  # table missing - events live in memory only until it exists
    try:
        import db

        db.insert_app_events(batch)
        _table_ok = True
    except Exception as e:
        if _table_ok:
            print(f"[warn] app_event not writable (run schema.sql section 35?): {_clip(e, 160)}")
        _table_ok = False
        _table_retry_at = time.time() + 300


# ---------- errors ----------

def new_error_id() -> str:
    return secrets.token_hex(3).upper()  # e.g. "4F1A9C" - short enough to read out


def error(where: str, exc=None, *, message=None, status=500, alert_admin=True, extra=None) -> str:
    """Records an error and (throttled) emails the admin. `where` is the
    place in the product, e.g. "chat: reading your note". Returns the
    reference code to show the user."""
    error_id = new_error_id()
    kind = type(exc).__name__ if exc is not None else "Error"
    text = _clip(message if message is not None else exc)
    user_id = current_user()
    record("error", where, status=status, error_id=error_id,
           detail={"type": kind, "message": text, "feature": current_feature(), **(extra or {})})
    print(f"[error {error_id}] {where}: {kind}: {text}")
    if alert_admin:
        alert(
            f"error:{where}:{kind}",
            f"Error in {where} ({kind})",
            f"Reference: {error_id}\nWhere: {where}\nError: {kind}: {text}\n"
            f"User: {_user_label(user_id)}\nStatus: {status}\n"
            f"Time: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        )
    return error_id


def _user_label(user_id) -> str:
    if not user_id:
        return "(none)"
    try:
        import db

        return f"{db.get_user_email(user_id)} ({user_id})"
    except Exception:
        return str(user_id)


# ---------- alerts ----------

def alert_email():
    return os.environ.get("ALERT_EMAIL")


def alert(key: str, subject: str, body: str) -> bool:
    """Emails ALERT_EMAIL in the background. False when throttled or not
    configured. Never raises - alerting must not break the request."""
    to = alert_email()
    if not to:
        return False
    now = time.time()
    with _alert_lock:
        today = date.today().isoformat()
        if _alert_day["day"] != today:
            _alert_day.update(day=today, count=0)
        if now - _last_alert.get(key, 0) < ALERT_COOLDOWN:
            return False
        if _alert_day["count"] >= ALERT_DAILY_CAP:
            return False
        _last_alert[key] = now
        _alert_day["count"] += 1
        last_one = _alert_day["count"] == ALERT_DAILY_CAP

    def send():
        try:
            import email_client

            note = "\n\n(Daily alert cap reached - no more alerts today; see the admin page.)" if last_one else ""
            email_client.send_email(to, f"[MyConfía] {subject}", body + note)
        except Exception as e:
            print(f"[warn] alert email failed: {_clip(e, 160)}")

    threading.Thread(target=send, daemon=True, name="obs-alert").start()
    return True
