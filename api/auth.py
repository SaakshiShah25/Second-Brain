"""
api/auth.py — verifies the Supabase-issued access token on every
protected request and resolves it to a user id.

Rather than decoding the JWT ourselves (which would mean handling
Supabase's JWT secret/JWKS and keeping it in sync with whatever signing
algorithm the project uses), this hands the token to Supabase's own Auth
server via supabase-py's `auth.get_user(jwt)` - it validates the token
and returns the user it belongs to, or raises if the token is missing/
expired/invalid. One extra network round-trip per request, but no
crypto/key-management code to get wrong.

Invite-only: when ALLOWED_EMAILS is set (comma-separated addresses, or
"@company.com" for a whole domain), every other signed-in account gets a
403 "invite_only" on every request - the app runs on shared free-tier AI
quotas, so only invited people can use it. Unset = open to anyone (dev).
"""

import os

from fastapi import Header, HTTPException

import db


def _allowlist() -> list:
    raw = os.environ.get("ALLOWED_EMAILS", "")
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


def is_invited(email) -> bool:
    allowed = _allowlist()
    if not allowed:
        return True
    email = (email or "").lower()
    return any(email == a or (a.startswith("@") and email.endswith(a)) for a in allowed)


def get_current_user_id(authorization: str = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ")

    try:
        response = db.get_client().auth.get_user(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired session")

    if not response or not response.user:
        raise HTTPException(401, "Invalid or expired session")

    if not is_invited(response.user.email):
        import observability

        observability.record("limit", "not_invited", user_id=response.user.id, detail={"email": response.user.email})
        observability.alert(f"invite:{response.user.email}", "Someone not on the invite list tried to sign in",
                            f"{response.user.email} signed in but isn't in ALLOWED_EMAILS, so they see the "
                            "'not on the list yet' screen. Add them to ALLOWED_EMAILS on Render to let them in.")
        raise HTTPException(403, "invite_only")

    return response.user.id
