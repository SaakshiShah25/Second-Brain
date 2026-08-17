"""
google_client.py — Shared Google API configuration, used by
google_calendar.py (Calendar OAuth + event sync) and google_maps.py
(reverse geocoding). Both talk to Google's plain REST endpoints directly
(no google-api-python-client/google-auth-oauthlib) - one less set of SDKs
to depend on, consistent with llm_client.py's thin env-var-backed client.

Setup (Google Cloud Console - console.cloud.google.com):
    1. Create/reuse a project, enable the "Google Calendar API".
    2. Configure the OAuth consent screen (External; Testing mode is
       fine for personal use - add your own Google account as a test
       user under "Test users").
    3. Create an OAuth 2.0 Client ID (Application type: Web application),
       with an authorized redirect URI matching GOOGLE_OAUTH_REDIRECT_URI
       below (e.g. http://localhost:8000/api/calendar/oauth/callback).
    4. Set these environment variables:
        export GOOGLE_CLIENT_ID="..."
        export GOOGLE_CLIENT_SECRET="..."
        export GOOGLE_OAUTH_REDIRECT_URI="http://localhost:8000/api/calendar/oauth/callback"

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
