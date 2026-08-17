"""
google_maps.py — turns an opt-in device location (see ChatInput.tsx's
location toggle) into something useful to store and show: a clickable
map link always, and a human-readable address if a Maps API key is
configured.

build_maps_url needs no API key at all - it's a plain Google Maps URL
scheme (https://www.google.com/maps?q=lat,lng), not an API call.
reverse_geocode is the only piece that needs GOOGLE_MAPS_API_KEY (the
Geocoding API) - if it's not set, capture.py simply skips it and stores
the map link alone, so this is genuinely optional setup.
"""

from typing import Optional

import requests

from google_client import get_maps_api_key

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"


def build_maps_url(lat: float, lng: float) -> str:
    return f"https://www.google.com/maps?q={lat},{lng}"


def reverse_geocode(lat: float, lng: float) -> Optional[str]:
    """Returns a human-readable address for (lat, lng), or None if no
    Maps API key is configured or the lookup didn't find anything."""
    api_key = get_maps_api_key()
    if not api_key:
        return None
    try:
        resp = requests.get(GEOCODE_URL, params={"latlng": f"{lat},{lng}", "key": api_key}, timeout=5)
        resp.raise_for_status()
        body = resp.json()
    except requests.RequestException:
        return None
    results = body.get("results") or []
    if not results:
        return None
    return results[0].get("formatted_address")
