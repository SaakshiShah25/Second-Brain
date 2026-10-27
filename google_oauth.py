"""
google_oauth.py — One Google account connection per user, shared by every
Google feature (Calendar today, Drive document import, anything later).

Instead of a separate OAuth flow per feature, a user connects their
Google account once and grants features incrementally: each "connect"
asks only for the scopes that feature needs, with
include_granted_scopes=true so Google merges them into the same grant -
connecting Drive after Calendar keeps Calendar working, and the stored
`scope` string always reflects everything granted so far.

This is separate from "Sign in with Google" (Supabase Auth, LoginPage):
sign-in proves who the user is and only ever asks for their email; this
module asks for access to their Calendar/Drive data, and only when they
turn a feature on. When the user signed in with Google, the connect flow
passes their email as login_hint, so it's a single consent tap with no
account picker.

Tokens are stored encrypted in google_credentials (see db.py) and never
leave the backend. See google_client.py for the Google Cloud Console setup.
"""

import base64
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

import db
from google_client import get_oauth_config

TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"

# Always requested - lets us show "Connected as you@gmail.com".
BASE_SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email"]
FEATURE_SCOPES = {
    "calendar": "https://www.googleapis.com/auth/calendar.events",
    # Read-only, needed to list a chosen folder's files and read them for
    # filing/search. A "restricted" scope: fine for test users while the
    # Google Cloud app is in Testing mode; public launch needs Google's
    # verification (see google_client.py).
    "drive": "https://www.googleapis.com/auth/drive.readonly",
}
FEATURES = tuple(FEATURE_SCOPES)


class NotConnectedError(Exception):
    """The user hasn't connected Google, or hasn't granted the feature
    the caller needs."""


def features_of(scope: Optional[str]) -> list:
    granted = set((scope or "").split())
    return [f for f, s in FEATURE_SCOPES.items() if s in granted]


def build_authorize_url(state: str, features: list, login_hint: Optional[str] = None) -> str:
    config = get_oauth_config()
    scopes = BASE_SCOPES + [FEATURE_SCOPES[f] for f in features if f in FEATURE_SCOPES]
    params = {
        "client_id": config.client_id,
        "redirect_uri": config.redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",           # we need a refresh_token
        "include_granted_scopes": "true",   # merge with what's already granted
        "prompt": "consent",                # Google only re-issues a refresh_token on consent
        "state": state,
    }
    if login_hint:
        params["login_hint"] = login_hint
    query = "&".join(f"{k}={requests.utils.quote(v)}" for k, v in params.items())
    return f"{AUTH_URL}?{query}"


def _email_from_id_token(id_token: Optional[str]) -> Optional[str]:
    """The id_token came straight from Google's token endpoint over TLS,
    so reading its payload without re-verifying the signature is safe."""
    if not id_token:
        return None
    try:
        payload = id_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("email")
    except Exception:
        return None


def exchange_code(user_id: str, code: str) -> list:
    """Exchanges the consent-screen code for tokens, merges them into any
    existing connection, and returns the features now granted."""
    config = get_oauth_config()
    resp = requests.post(TOKEN_URL, data={
        "code": code,
        "client_id": config.client_id,
        "client_secret": config.client_secret,
        "redirect_uri": config.redirect_uri,
        "grant_type": "authorization_code",
    }, timeout=20)
    resp.raise_for_status()
    body = resp.json()
    existing = db.get_google_credentials(user_id)
    refresh_token = body.get("refresh_token") or (existing or {}).get("refresh_token")
    if not refresh_token:
        raise RuntimeError("Google didn't return a refresh token - remove MyConfía's access at "
                           "myaccount.google.com/permissions and connect again.")
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=body["expires_in"])
    scope = body.get("scope", "")
    db.upsert_google_credentials(
        user_id,
        access_token=body["access_token"],
        refresh_token=refresh_token,
        expires_at=expires_at.isoformat(),
        scope=scope,
        google_email=_email_from_id_token(body.get("id_token")) or (existing or {}).get("google_email"),
    )
    return features_of(scope)


def _refresh(user_id: str, refresh_token: str) -> str:
    config = get_oauth_config()
    resp = requests.post(TOKEN_URL, data={
        "refresh_token": refresh_token,
        "client_id": config.client_id,
        "client_secret": config.client_secret,
        "grant_type": "refresh_token",
    }, timeout=20)
    if resp.status_code == 400 and resp.json().get("error") == "invalid_grant":
        # Access was revoked from the Google side - treat as disconnected.
        db.delete_google_credentials(user_id)
        raise NotConnectedError("Google access was revoked - connect again.")
    resp.raise_for_status()
    body = resp.json()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=body["expires_in"])
    db.update_google_access_token(user_id, access_token=body["access_token"], expires_at=expires_at.isoformat())
    return body["access_token"]


def get_valid_access_token(user_id: str, feature: Optional[str] = None) -> str:
    creds = db.get_google_credentials(user_id)
    if not creds:
        raise NotConnectedError("Google isn't connected for this account yet.")
    if feature and feature not in features_of(creds.get("scope")):
        raise NotConnectedError(f"Google {feature.title()} access hasn't been granted yet.")
    expires_at = datetime.fromisoformat(creds["expires_at"])
    if expires_at <= datetime.now(timezone.utc) + timedelta(seconds=60):
        return _refresh(user_id, creds["refresh_token"])
    return creds["access_token"]


def status(user_id: str) -> dict:
    creds = db.get_google_credentials(user_id)
    if not creds:
        return {"connected": False, "email": None, "features": []}
    return {"connected": True, "email": creds.get("google_email"), "features": features_of(creds.get("scope"))}


def disconnect(user_id: str) -> None:
    """Revokes the grant at Google (best-effort) and forgets the tokens."""
    creds = db.get_google_credentials(user_id)
    if creds:
        try:
            requests.post(REVOKE_URL, params={"token": creds["refresh_token"]}, timeout=10)
        except requests.RequestException:
            pass
    db.delete_google_credentials(user_id)
