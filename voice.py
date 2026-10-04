"""
voice.py — Transcribes a recorded voice note into text using Groq's hosted
Whisper model, so voice input can be fed through the exact same
capture_note()/answer_query() pipeline used for typed text (see
views/chat_view.py). No separate credentials needed - reuses the same
shared Groq client and GROQ_API_KEY as extraction.py/retrieval.py.
"""

from llm_client import get_client, WHISPER_MODEL_NAME
from text_utils import fix_transcript_casing


def transcribe_audio(audio_bytes: bytes, filename: str = "note.wav") -> str:
    """
    Sends recorded audio to Groq's Whisper endpoint and returns the
    transcript text. Raises whatever the Groq client raises on failure
    (e.g. missing/invalid API key, network error) - callers are expected
    to handle that the same way they already handle other Groq call
    failures (extraction/retrieval already wrap these in try/except).

    fix_transcript_casing() corrects a known Whisper quirk - the
    standalone pronoun "I" and sentence-initial words sometimes come back
    lowercased - before this text is shown to the user or fed into
    extraction, since it's stored verbatim as the note's raw_text.
    """
    client = get_client()
    transcription = client.audio.transcriptions.create(
        file=(filename, audio_bytes),
        model=WHISPER_MODEL_NAME,
    )
    return fix_transcript_casing(transcription.text)
