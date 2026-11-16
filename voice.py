"""
voice.py — Transcribes a recorded voice note into text using Groq's hosted
Whisper model, so voice input can be fed through the exact same
capture_note()/answer_query() pipeline used for typed text (see
views/chat_view.py). No separate credentials needed - reuses the same
shared Groq client and GROQ_API_KEY as extraction.py/retrieval.py.
"""

from llm_client import get_client, WHISPER_MODEL_NAME
from text_utils import fix_transcript_casing, remove_fillers

# Whisper imitates the style of this text: a tidy, filler-free, well-punctuated sample nudges it to
# write the same way. It is not a guarantee, so remove_fillers() below still runs on the result.
_STYLE_PROMPT = "A clear, well-punctuated note, without filler words or false starts."


# Whisper, given silence or room noise, tends to INVENT a stock phrase ("I'm sorry", "Thank you", "Okay"). Those must never
# reach the person's box as if they had said them.
_SILENCE_PHRASES = {
    "thank you", "thanks", "thank you for watching", "thanks for watching", "you", "bye", "bye bye", "goodbye",
    "i'm sorry", "i am sorry", "sorry", "okay", "ok", "oh", "uh", "um", "hmm", "mm", "so", "yeah", "the end",
    "subtitles by the amaraorg community", "please subscribe", "like and subscribe",
}


def _norm(text: str) -> str:
    return " ".join("".join(c for c in (text or "").lower().replace("’", "'") if c.isalnum() or c in " '").split())


def _get(obj, key, default=None):
    return obj.get(key, default) if isinstance(obj, dict) else getattr(obj, key, default)


def _speech_only(transcription) -> str:
    """The transcript without the parts Whisper itself was unsure held any speech.

    verbose_json gives each segment a no_speech_prob and avg_logprob. A segment is dropped when Whisper thought it
    probably wasn't speech and was unsure of the words (its own rule of thumb), or when it is one of those stock
    phrases and Whisper was only a little sure. Nothing left means nothing was said."""
    segments = _get(transcription, "segments") or []
    if not segments:
        # No per-segment detail to judge by: all that can be said is that a lone stock phrase is almost surely invented.
        text = _get(transcription, "text", "") or ""
        return "" if _norm(text) in _SILENCE_PHRASES else text
    kept = []
    for seg in segments:
        text = _get(seg, "text", "") or ""
        no_speech = _get(seg, "no_speech_prob", 0.0) or 0.0
        logprob = _get(seg, "avg_logprob", 0.0) or 0.0
        if no_speech > 0.6 and logprob < -1.0:
            continue
        if _norm(text) in _SILENCE_PHRASES and (no_speech > 0.3 or logprob < -0.6):
            continue
        kept.append(text)
    return "".join(kept).strip()


def transcribe_audio(audio_bytes: bytes, filename: str = "note.wav") -> str:
    """
    Sends recorded audio to Groq's Whisper endpoint and returns the
    transcript text - or "" when nothing was really said (silence, or only
    the stock phrases Whisper makes up for silence).
    Raises whatever the Groq client raises on failure
    (e.g. missing/invalid API key, network error) - callers are expected
    to handle that the same way they already handle other Groq call
    failures (extraction/retrieval already wrap these in try/except).

    fix_transcript_casing() corrects a known Whisper quirk - the
    standalone pronoun "I" and sentence-initial words sometimes come back
    lowercased - before this text is shown to the user or fed into
    extraction, since it's stored verbatim as the note's raw_text. The same goes for spoken
    hesitations ("uh", "umm"): they are not part of what the person meant, so they are removed.
    """
    client = get_client()
    kwargs = dict(file=(filename, audio_bytes), model=WHISPER_MODEL_NAME, prompt=_STYLE_PROMPT, temperature=0)
    try:
        transcription = client.audio.transcriptions.create(response_format="verbose_json", **kwargs)
    except Exception as e:  # noqa: BLE001 - a model that does not offer verbose_json: plain text, minus the stock-phrase check
        if "response_format" not in str(e).lower() and "verbose" not in str(e).lower():
            raise
        transcription = client.audio.transcriptions.create(**kwargs)
    text = _speech_only(transcription)
    if not text.strip():
        return ""
    return remove_fillers(fix_transcript_casing(text))
