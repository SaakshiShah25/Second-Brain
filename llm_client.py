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
MODEL_NAME = "openai/gpt-oss-120b"

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
