"""
google_client.py — Shared Google API configuration, used by
google_calendar.py (Calendar OAuth + event sync) and google_maps.py
(reverse geocoding). Both talk to Google's plain REST endpoints directly
(no google-api-python-client/google-auth-oauthlib) - one less set of SDKs
to depend on, consistent with llm_client.py's thin env-var-backed client.

Setup (Google Cloud Console - console.cloud.google.com) - one OAuth
client serves all three Google features: Sign in with Google (via
Supabase Auth), Calendar and Drive (via google_oauth.py):
    1. Create/reuse a project; enable the "Google Calendar API" and the
       "Google Drive API".
    2. OAuth consent screen: External. Add the scopes openid, email,
       calendar.events and drive.readonly. While in Testing mode, add every
       Google account that will use it under "Test users" (max 100).
       Publishing for everyone needs Google's verification - drive.readonly
       is a restricted scope (security assessment required).
    3. Create an OAuth 2.0 Client ID (Web application) with BOTH
       authorized redirect URIs:
         - GOOGLE_OAUTH_REDIRECT_URI below
           (e.g. http://localhost:8000/api/google/oauth/callback)
         - https://<project-ref>.supabase.co/auth/v1/callback  (sign-in)
    4. Supabase dashboard > Authentication > Providers > Google: enable,
       paste the same client id/secret. Under URL Configuration, add the
       frontend URL(s) (e.g. http://localhost:5173/**) to Redirect URLs.
    5. Set these environment variables:
        export GOOGLE_CLIENT_ID="..."
        export GOOGLE_CLIENT_SECRET="..."
        export GOOGLE_OAUTH_REDIRECT_URI="http://localhost:8000/api/google/oauth/callback"

    Optional, only needed for human-readable addresses (google_maps.py's
    reverse_geocode) - without it, location capture still works and
    stores a working map link, just without a readable address:
    5. Enable the "Geocoding API" and create an API key.
        export GOOGLE_MAPS_API_KEY="..."
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class OAuthConfig:
    client_id: str
    client_secret: str
    redirect_uri: str


def get_oauth_config() -> OAuthConfig:
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.environ.get("GOOGLE_OAUTH_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        raise RuntimeError(
            "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI "
            "environment variables not set. See google_client.py's module docstring "
            "for how to create them in the Google Cloud Console."
        )
    return OAuthConfig(client_id=client_id, client_secret=client_secret, redirect_uri=redirect_uri)


def get_maps_api_key() -> Optional[str]:
    """None means reverse-geocoding is unavailable - google_maps.py degrades
    gracefully (map link only, no address) rather than erroring, since this
    key is optional setup, unlike the OAuth config above."""
    return os.environ.get("GOOGLE_MAPS_API_KEY") or None
