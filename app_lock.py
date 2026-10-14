"""
app_lock.py - the account-wide app-lock PIN.

The PIN belongs to the ACCOUNT, not to one browser: set it once and every
device and browser signed in to that account asks for the same one. (It used
to live only in each browser's local storage, which meant a different PIN to
remember per device.) The server keeps only a salted hash, and checks guesses
itself, so the wrong-PIN lockout is real: it is counted per account in the
database and can't be reset by clearing a browser's storage.

What the PIN is and isn't: a lock for an app that is ALREADY signed in, there
to stop someone who picks up an unlocked phone. Signing in (Supabase Auth)
is still the real login, and the notes themselves are protected by
encryption, not by this PIN. A 4-6 digit PIN has at most a million values, so
the hash is slowed (PBKDF2) and mixed with a server-side secret (a "pepper"
derived from ENCRYPTION_KEY, never stored in the database) - someone who
obtains only the database can't brute-force the PIN from it.
"""

import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import db

ITERATIONS = 210_000
PIN_PATTERN = re.compile(r"^\d{4,6}$")

# After this many wrong PINs in a row the account refuses guesses for a
# while, doubling with each further miss (30s, 1m, 2m ... capped at 15 min).
FREE_ATTEMPTS = 5
BASE_LOCKOUT_SECONDS = 30
MAX_LOCKOUT_SECONDS = 15 * 60


def _pepper() -> bytes:
    key = os.environ.get("ENCRYPTION_KEY", "")
    return hashlib.sha256(b"confia-app-lock-pepper:" + key.encode()).digest()


def new_salt() -> str:
    return secrets.token_hex(16)


def hash_pin(pin: str, salt_hex: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", _pepper() + pin.encode(), bytes.fromhex(salt_hex), ITERATIONS
    ).hex()


def lockout_seconds(fails: int) -> int:
    """How long to refuse guesses after `fails` wrong PINs in a row."""
    over = fails - FREE_ATTEMPTS
    if over < 0:
        return 0
    return min(BASE_LOCKOUT_SECONDS * 2**over, MAX_LOCKOUT_SECONDS)


def is_valid_pin(pin: str) -> bool:
    return bool(PIN_PATTERN.match(pin or ""))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _remaining(locked_until: Optional[str]) -> int:
    if not locked_until:
        return 0
    until = datetime.fromisoformat(locked_until.replace("Z", "+00:00"))
    return max(0, int((until - _now()).total_seconds() + 0.999))


def is_enabled(user_id: str) -> bool:
    return db.get_app_lock(user_id) is not None


def set_pin(user_id: str, pin: str) -> None:
    salt = new_salt()
    db.save_app_lock(user_id, salt, hash_pin(pin, salt))


def disable(user_id: str) -> None:
    db.delete_app_lock(user_id)


def check_pin(user_id: str, pin: str) -> dict:
    """Checks a guess against the account's PIN, counting misses.

    Returns {"enabled": bool, "ok": bool, "retry_after": seconds}. While the
    account is locked out the guess is not even evaluated (so waiting out a
    lockout can't be sped up by guessing during it). A correct PIN resets
    the miss counter."""
    row = db.get_app_lock(user_id)
    if row is None:
        return {"enabled": False, "ok": False, "retry_after": 0}

    wait = _remaining(row.get("locked_until"))
    if wait > 0:
        return {"enabled": True, "ok": False, "retry_after": wait}

    ok = hmac.compare_digest(hash_pin(pin or "", row["salt"]), row["pin_hash"])
    fails = row.get("fails") or 0
    if ok:
        if fails or row.get("locked_until"):
            db.update_app_lock_attempts(user_id, 0, None)
        return {"enabled": True, "ok": True, "retry_after": 0}

    fails += 1
    delay = lockout_seconds(fails)
    db.update_app_lock_attempts(
        user_id, fails, (_now() + timedelta(seconds=delay)).isoformat() if delay else None
    )
    return {"enabled": True, "ok": False, "retry_after": delay}
