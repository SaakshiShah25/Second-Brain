"""
voice.py — Transcribes a recorded voice note into text using Groq's hosted
Whisper model, so voice input can be fed through the exact same
capture_note()/answer_query() pipeline used for typed text (see
views/chat_view.py). No separate credentials needed - reuses the same
shared Groq client and GROQ_API_KEY as extraction.py/retrieval.py.
"""

from llm_client import get_client, WHISPER_MODEL_NAME


def transcribe_audio(audio_bytes: bytes, filename: str = "note.wav") -> str:
    """
    Sends recorded audio to Groq's Whisper endpoint and returns the
    transcript text. Raises whatever the Groq client raises on failure
    (e.g. missing/invalid API key, network error) - callers are expected
    to handle that the same way they already handle other Groq call
    failures (extraction/retrieval already wrap these in try/except).
    """
    client = get_client()
    transcription = client.audio.transcriptions.create(
        file=(filename, audio_bytes),
        model=WHISPER_MODEL_NAME,
    )
    return transcription.text
