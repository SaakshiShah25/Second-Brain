"""
gemini_client.py — Optional second provider for extraction.py, used only
when Groq's account-wide free-tier token budget is exhausted.

Why: the 2026-10 load test showed Groq's free "on_demand" tier caps
openai/gpt-oss-120b at 8000 TPM, shared across every user's extraction
calls - as few as two people logging notes at the same moment can blow
that budget and get a 429. Google's Gemini free tier (per
aistudio.google.com/apikey) is far more generous on flash models, so
this exists purely as a fallback target for that specific failure, not
a replacement for Groq.

Entirely optional: if GEMINI_API_KEY isn't set, available() is False and
extraction.py just lets the original Groq error propagate, exactly like
before this file existed. Uses a plain REST call (like google_maps.py)
rather than adding the google-genai SDK as a new dependency for what is
otherwise a single endpoint.

Get a free key at https://aistudio.google.com/apikey
"""

import os

import requests

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


def available() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


def generate_json(system_prompt: str, user_content: str, temperature: float = 0.2) -> str:
    """Returns the model's raw text output (expected to be a JSON string,
    since response_mime_type is forced to application/json) - caller
    still does its own json.loads/validation, same as the Groq call it's
    standing in for. Raises requests.RequestException on failure; callers
    should only reach this after already checking available()."""
    api_key = os.environ.get("GEMINI_API_KEY")
    resp = requests.post(
        GEMINI_URL,
        params={"key": api_key},
        json={
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_content}]}],
            "generationConfig": {
                "temperature": temperature,
                "response_mime_type": "application/json",
            },
        },
        timeout=30,
    )
    resp.raise_for_status()
    body = resp.json()
    return body["candidates"][0]["content"]["parts"][0]["text"]
