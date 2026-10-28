"""
text_utils.py - Cleans up "smart typography" Unicode characters the LLM
sometimes reaches for (a narrow no-break space U+202F between words in
names/dates, a non-breaking hyphen U+2011) instead of plain ASCII ones.
Most fonts render these as a barely-there gap or nothing at all, which is
what makes "Smith Desai" look like "SmithDesai" and dates look oddly
spaced. Applied to every LLM text output before it's stored or shown.
"""

import re

# Built from codepoints (rather than embedding the literal characters)
# so the actual bytes in this file stay unambiguous ASCII.
_SPACE_CODEPOINTS = [0x00A0, 0x2007, 0x2009, 0x200A, 0x202F]
_ZERO_WIDTH_CODEPOINTS = [0xFEFF, 0x200B]
_HYPHEN_CODEPOINTS = [0x2011]

_REPLACEMENTS = {}
for _cp in _SPACE_CODEPOINTS:
    _REPLACEMENTS[chr(_cp)] = " "
for _cp in _ZERO_WIDTH_CODEPOINTS:
    _REPLACEMENTS[chr(_cp)] = ""
for _cp in _HYPHEN_CODEPOINTS:
    _REPLACEMENTS[chr(_cp)] = "-"


_MONTHS = (r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|"
           r"Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)")
_CLOCK = r"\d{1,2}(?::\d{2})?\s*[ap](?:m|\.m\.)(?![A-Za-z])"
_MONTH_THEN_TIME = re.compile(rf"\b({_MONTHS}\.?\s+\d{{1,2}}(?:st|nd|rd|th)?)\s+({_CLOCK})", re.I)
_DAY_THEN_TIME = re.compile(rf"\b(\d{{1,2}}(?:st|nd|rd|th)?\s+{_MONTHS})\s+({_CLOCK})", re.I)
_AM_PM = re.compile(r"\b(\d{1,2}(?::\d{2})?)\s*([ap])(?:m|\.m\.)(?![A-Za-z])", re.I)


def tidy_dates_and_times(text: str) -> str:
    """Standard punctuation for a date followed by a time: "by October 27 8pm"
    becomes "by October 27, 8 PM", and "7:30pm" becomes "7:30 PM". ("October 27
    at 8pm" keeps its "at" and just gets the PM fixed.) Models write these
    inconsistently, so it is applied to everything they write."""
    text = _MONTH_THEN_TIME.sub(lambda m: f"{m.group(1)}, {m.group(2)}", text)
    text = _DAY_THEN_TIME.sub(lambda m: f"{m.group(1)}, {m.group(2)}", text)
    return _AM_PM.sub(lambda m: f"{m.group(1)} {m.group(2).upper()}M", text)


def normalize_text(text: str) -> str:
    if not text:
        return text
    for bad, good in _REPLACEMENTS.items():
        text = text.replace(bad, good)
    return tidy_dates_and_times(text)


_STANDALONE_I = re.compile(r"\bi\b")
_SENTENCE_START = re.compile(r"(^\s*|[.!?]\s+)([a-z])")


def fix_transcript_casing(text: str) -> str:
    """Whisper's transcripts sometimes come back with the standalone
    pronoun "I" lowercased, and sentence-initial words in lowercase too -
    a known transcription-model quirk, not something the user actually
    said differently. Fixed deterministically here rather than relying on
    the extraction LLM to notice and correct it, since raw_text is stored
    and displayed verbatim as "the original note" - it should read the
    way the user would naturally write it themselves.

    Does NOT attempt mid-sentence proper-noun capitalization (a person's
    name, a company) - telling "apple" the fruit from "Apple" the company
    needs real language understanding, not a regex. That's handled
    separately: see extraction.py's prompt, which explicitly capitalizes
    names/companies in its own structured output fields regardless of
    how they appear in the source text."""
    if not text:
        return text
    text = _STANDALONE_I.sub("I", text)
    text = _SENTENCE_START.sub(lambda m: m.group(1) + m.group(2).upper(), text)
    return text


_LEADING_BULLET = re.compile(r"^[\s\-\u2013\u2014\u2022*]+")


def strip_bullet(text):
    """Drops list-marker characters the model sometimes leaves at the start of a line
    ("- Scrum call at 10 AM" -> "Scrum call at 10 AM"). Non-strings pass through."""
    if not isinstance(text, str):
        return text
    return _LEADING_BULLET.sub("", text).strip()


# "Remind me to call mom", "Add a task to remind me about X", "Don't forget to X", "I need to X" ...
# The wrapper around a to-do is not part of the to-do; the action is.
_TASK_WRAPPERS = [
    re.compile(r"^(please\s+)?(add|create|make|set)\s+(me\s+)?(a|an|the)?\s*(new\s+)?(task|reminder|to-?do)\b[^,.:;]*?\b(to|about|of|that)\s+(remind\s+me\s+(to|about|of)\s+)?", re.I),
    re.compile(r"^(please\s+)?(add|create|make|set)\s+(me\s+)?(a|an|the)?\s*(new\s+)?(task|reminder|to-?do)\s*(for\s+me\s*)?[:\-]\s*", re.I),
    re.compile(r"^(task|reminder|to-?do)\s*[:\-]\s*", re.I),
    re.compile(r"^(please\s+)?remind\s+me\s+(to|about|of|that)\s+", re.I),
    re.compile(r"^(please\s+)?(don'?t|do\s+not)\s+forget\s+(to\s+)?", re.I),
    re.compile(r"^(please\s+)?make\s+sure\s+(that\s+)?(i\s+|to\s+)?", re.I),
    re.compile(r"^(i\s+)?(need|have|should|must|ought|want)\s+to\s+", re.I),
    re.compile(r"^(i\s+)?(need|have|should|must)\s+", re.I),
]


# "remind me about STARTING a workout" -> "START a workout"
_GERUNDS = {
    "starting": "start", "doing": "do", "going": "go", "making": "make", "taking": "take", "buying": "buy",
    "calling": "call", "booking": "book", "renewing": "renew", "paying": "pay", "sending": "send",
    "learning": "learn", "studying": "study", "reading": "read", "writing": "write", "cleaning": "clean",
    "checking": "check", "visiting": "visit", "cooking": "cook", "exercising": "exercise", "practicing": "practice",
    "practising": "practise", "running": "run", "walking": "walk", "drinking": "drink", "eating": "eat",
    "sleeping": "sleep", "meeting": "meet", "finishing": "finish", "submitting": "submit", "filing": "file",
    "updating": "update", "scheduling": "schedule", "booking": "book", "applying": "apply", "emailing": "email",
    "ordering": "order", "picking": "pick", "cancelling": "cancel", "canceling": "cancel", "planning": "plan",
}


def clean_task_text(text):
    """A to-do as just the action: wrappers like "remind me to" / "add a task to" / "I need to"
    are dropped and the first letter capitalised. If nothing would be left, the text is unchanged."""
    if not isinstance(text, str):
        return text
    out = strip_bullet(text)
    for _ in range(3):  # "Remind me to ... " can sit inside "Add a task ..."
        changed = False
        for pattern in _TASK_WRAPPERS:
            trimmed = pattern.sub("", out, count=1).strip()
            if trimmed and trimmed != out:
                out, changed = trimmed, True
                break
        if not changed:
            break
    if out != strip_bullet(text):  # a wrapper was removed: "...about starting X" reads better as "Start X"
        first, _, rest = out.partition(" ")
        if first.lower() in _GERUNDS:
            out = (_GERUNDS[first.lower()] + " " + rest).strip()
    return out[:1].upper() + out[1:] if out else strip_bullet(text)


# Spoken hesitations only (never real words): "uh", "um", "umm", "uhm", "erm", "hmm", "mm", "mhm".
_FILLER = re.compile(
    r"(?<![\w'-])(?:u+h+m*|u+m+|u+h+m+|e+r+m+|h+m+|m{2,}|m+h+m+)(?![\w'-])[,.;:…\-]*\s*",
    re.I,
)


# Whisper sometimes spells "hmm" as "hum": only when it stands alone between commas / sentence breaks.
_HUM = re.compile(r"(?<=[,.]\s)hum(?=\s*[,.])[,.]?\s*", re.I)
# A comma straight after one of these (left behind where a filler was) cuts a phrase in half: "need to, send".
_DANGLING_COMMA = re.compile(r"\b(to|the|a|an|of|and|that|with|for|in|on|at|by|i|we|you|but|or)\s*,\s+", re.I)


def remove_fillers(text):
    """A dictated note without the "uh, umm..." hesitations: "Uh, I need to... umm, send the deck"
    -> "I need to send the deck". Only filler sounds are removed - never ordinary words - and
    the sentence is re-capitalised where a filler started it."""
    if not isinstance(text, str) or not text.strip():
        return text
    if not (_FILLER.search(text) or _HUM.search(text)):
        return text
    out = _FILLER.sub(" ", _HUM.sub(" ", text))  # "hum" first: its comma context is still there
    out = re.sub(r"\s+([,.;:!?])", r"\1", out)           # no space before punctuation
    out = re.sub(r"([,;:])(\s*[,;:])+", r"\1", out)        # ",," left behind
    out = re.sub(r"\.{2,}|…", " ", out)                    # trailing-off dots around a hesitation
    out = _DANGLING_COMMA.sub(lambda m: m.group(1) + " ", out)
    out = re.sub(r"\s{2,}", " ", out).strip(" ,;")
    out = re.sub(r"(^|[.!?]\s+)([a-z])", lambda m: m.group(1) + m.group(2).upper(), out)  # sentence starts
    return out or text.strip()
