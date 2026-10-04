"""
crypto_utils.py — Application-level encrypt-at-rest for note/person/task
content. db.py is the only file that imports this (same as it's the only
file that talks to Supabase directly - see db.py's own docstring), so
every other module (retrieval.py, extraction.py, morning_brief.py,
google_calendar.py, every api/routers/*.py) keeps seeing plain Python
strings exactly as before; the encrypt/decrypt boundary is db.py's row
reads/writes, not the callers.

Uses Fernet (AES-128-CBC + HMAC, from the `cryptography` package) with a
single symmetric key the app holds - not end-to-end/zero-knowledge
encryption. The threat model this protects against: someone with direct
database access (a leaked service-role key, a DB dump, an operator
browsing the table) sees ciphertext, not notes. It does NOT protect
against the app itself, which still decrypts to run extraction, search,
chat Q&A, and the daily brief - that's the deliberate trade-off (see the
plan this was built from), since those AI features are the product.

Setup:
    Generate a key once with:
        python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    Set it as the ENCRYPTION_KEY environment variable (Render dashboard
    + local .env - see README.md), same convention as SUPABASE_KEY/
    GROQ_API_KEY (db.py's get_client(), llm_client.py's get_client()).

    IMPORTANT: if this key is ever lost, every already-encrypted row
    becomes permanently unreadable - there is no recovery path. Back it
    up somewhere durable (a password manager), the same way you would
    any other credential.
"""

import json
import os
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken


@lru_cache
def _fernet() -> Fernet:
    key = os.environ.get("ENCRYPTION_KEY")
    if not key:
        raise RuntimeError(
            "ENCRYPTION_KEY environment variable not set. Generate one with "
            "`python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"` "
            "and set it as ENCRYPTION_KEY. See README.md."
        )
    return Fernet(key.encode())


def encrypt(value: Optional[str]) -> Optional[str]:
    """Encrypts a plain string. None and "" pass through unchanged (so
    optional/blank fields don't turn into a ciphertext blob of nothing)."""
    if not value:
        return value
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: Optional[str]) -> Optional[str]:
    """Decrypts a value encrypt() produced. Falls back to returning the
    input unchanged on InvalidToken rather than raising - this is what
    lets already-plaintext rows (anything written before this migration,
    or a field that was never encrypted) pass through safely instead of
    500ing the page. See scripts/encrypt_existing_data.py for the
    one-time backfill that makes this fallback the exception, not the rule."""
    if not value:
        return value
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return value


def encrypt_json(value) -> Optional[str]:
    """For jsonb-shaped fields (lists/dicts) that were migrated to a
    `text` column so they can hold a ciphertext blob - see schema.sql
    section 22. None passes through; everything else round-trips through
    JSON before encryption."""
    if value is None:
        return None
    return encrypt(json.dumps(value))


def decrypt_json(value):
    """Inverse of encrypt_json(). Falls back to returning the input
    unchanged if it's not a decryptable string (e.g. a pre-migration row
    that's still a native list/dict from Postgres, not yet converted to
    a text column, or empty) - same fail-open reasoning as decrypt()."""
    if value is None:
        return None
    if not isinstance(value, str):
        return value  # pre-migration row: still native jsonb (list/dict), not text yet
    text = decrypt(value)
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return text
