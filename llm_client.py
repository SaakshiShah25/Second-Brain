"""
llm_client.py — Shared Groq client, used by extraction.py (note extraction)
and retrieval.py (query understanding + answer synthesis). Groq's free
tier is used throughout this project for all LLM calls.

Get a free API key at: https://console.groq.com/keys
Then set it as an environment variable:
    export GROQ_API_KEY="your_key_here"
"""

import os
from groq import Groq

# Any current free Groq-hosted model works. Check console.groq.com/docs/models
# for the current list of available free models if this is deprecated.
# (llama-3.3-70b-versatile was retired by Groq - switched to gpt-oss-120b.)
#
# gpt-oss-120b is reserved for calls that actually need its quality
# (extraction.py's note extraction, retrieval.py's answer synthesis/
# briefings) - it shares one account-wide free-tier TPM budget across
# every user (see the 2026-10 load test: 8000 TPM, and a single
# extraction call can request ~5000 of it), so cheap classification
# calls (intent.py, retrieval.py's parse_query) use FAST_MODEL_NAME
# instead to leave headroom for the calls that matter.
MODEL_NAME = "openai/gpt-oss-120b"
# openai/gpt-oss-20b, not a llama-3.x model - Groq's free "on_demand" tier for
# this account no longer grants access to any Llama chat model (confirmed via
# client.models.list()); gpt-oss-20b is the smallest chat model available, and
# critically has its OWN separate 8000 TPM budget rather than sharing
# gpt-oss-120b's - that separation is the entire point of a second model here.
FAST_MODEL_NAME = "openai/gpt-oss-20b"

# Groq-hosted Whisper model used for voice-note transcription (voice.py).
# Check console.groq.com/docs/speech-to-text for the current list if deprecated.
WHISPER_MODEL_NAME = "whisper-large-v3-turbo"

_client = None


def get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GROQ_API_KEY environment variable not set. "
                "Get a free key at https://console.groq.com/keys"
            )
        _client = Groq(api_key=api_key)
    return _client
