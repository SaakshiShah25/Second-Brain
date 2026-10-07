"""
voice.py — Transcribes a recorded voice note into text using Groq's hosted
Whisper model, so voice input can be fed through the exact same
capture_note()/answer_query() pipeline used for typed text (see
views/chat_view.py). No separate credentials needed - reuses the same
shared Groq client and GROQ_API_KEY as extraction.py/retrieval.py.
"""

import re

from llm_client import get_client, WHISPER_MODEL_NAME
from text_utils import fix_transcript_casing

# Whisper does not return an empty transcript for silence - it invents a
# plausible-sounding one, and the same few phrases come up again and again
# (it was trained on a lot of video subtitles, which end in "Thank you." /
# "Thanks for watching"). Reproduced against real silent audio: pure
# silence came back as "Thank you.", faint room noise as ".", and a user's
# accidental tap-and-stop as "I'm going to go." Whisper's own confidence
# numbers can't be used to catch this (Groq reports no_speech_prob = 0 for
# every one of those), so a short transcript that is nothing BUT one of
# these phrases is treated as "no speech heard". Matched against the whole
# normalized transcript only - a longer note that happens to contain
# "thank you" is real speech and is left alone.
_WHISPER_FILLER = {
    "thank you", "thanks", "thank you very much", "thank you so much",
    "thanks for watching", "thank you for watching", "thank you for listening",
    "you", "bye", "bye bye", "goodbye", "okay", "ok", "so", "uh", "um", "hmm",
    "i'm going to go", "i'm going to go now", "i'll see you next time",
    "see you next time", "see you in the next video",
}
_NON_WORD = re.compile(r"[^a-z' ]+")


# A voice note is a few seconds to a couple of minutes (roughly 1 MB a
# minute for the browser's compressed recordings). Without a cap, one
# request could push an arbitrarily large file into server memory and on to
# a paid transcription call. 10 MB is several minutes of speech.
MAX_AUDIO_BYTES = 10 * 1024 * 1024


async def read_audio_upload(file) -> bytes:
    """Reads an uploaded recording into memory (it is never written to disk
    or stored - see transcribe_audio), refusing anything over
    MAX_AUDIO_BYTES. Reads one byte past the limit so an oversized file is
    detected without loading all of it."""
    from fastapi import HTTPException

    data = await file.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "That recording is too long. Try a shorter one - a few minutes at most.")
    return data


def is_whisper_filler(text: str) -> bool:
    normalized = " ".join(_NON_WORD.sub(" ", (text or "").lower().replace("\u2019", "'")).split())
    return normalized in _WHISPER_FILLER


def transcribe_audio(audio_bytes: bytes, filename: str = "note.wav") -> str:
    """
    Sends recorded audio to Groq's Whisper endpoint and returns the
    transcript text. The audio is held in memory only for this call - this
    app never writes it to disk or to the database, and only the resulting
    text is kept (and only if the user then saves it as a note). Raises whatever the Groq client raises on failure
    (e.g. missing/invalid API key, network error) - callers are expected
    to handle that the same way they already handle other Groq call
    failures (extraction/retrieval already wrap these in try/except).

    Returns "" when the audio contained no speech (see _WHISPER_FILLER
    above) - callers already treat an empty transcript as "didn't catch
    anything".

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
    text = transcription.text
    if is_whisper_filler(text):
        return ""
    return fix_transcript_casing(text)
