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
"""

from fastapi import Header, HTTPException

import db


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

    return response.user.id
