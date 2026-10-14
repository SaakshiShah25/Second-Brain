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


def normalize_text(text: str) -> str:
    if not text:
        return text
    for bad, good in _REPLACEMENTS.items():
        text = text.replace(bad, good)
    return text


_STANDALONE_I = re.compile(r"\bi\b")
_SENTENCE_START = re.compile(r"(^\s*|[.!?]\s+)([a-z])")


_MEANINGFUL_CONTENT = re.compile(r"[a-zA-Z0-9]{2,}")  # a real word/number, not just a stray character


def has_meaningful_content(text: str) -> bool:
    """True if `text` contains at least one real word or number (2+
    letters/digits in a row) - False for empty input, a single stray
    character (e.g. someone taps one key and hits send), or pure
    punctuation/whitespace. The latter matters specifically for Whisper:
    on silent or near-silent audio it doesn't always return a truly empty
    string - it sometimes hallucinates a minimal filler like a lone "."
    instead, which an `if not text.strip()` check lets straight through.
    Used to reject a capture before it ever reaches moderation/
    extraction, both because there's nothing real to log as a note, and
    because it's one fewer wasted LLM call on content with nothing in it."""
    return bool(text) and bool(_MEANINGFUL_CONTENT.search(text))


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


# ---------- Inputs too short to be a note or a question ----------
#
# "Hi", "Hello", "ok", "thanks", "test", a lone letter, an emoji: none of these
# is something to log or something to ask about. Without a check they went
# through two LLM calls (moderation, then intent) and then either got the
# "not something I can help with" refusal (a greeting) or - worse - were
# classified as a note and SAVED ("ok", "test"). This is the deterministic
# check that catches them before any model is called. frontend/src/lib/
# shortInput.ts is the same rule, so the app can answer instantly without a
# round trip; keep the two in step.
_WORD = re.compile(r"[^\W_]+", re.UNICODE)  # letters/digits, any language (names like "José")

_GREETINGS = {"hi", "hii", "hey", "heyy", "hello", "hola", "yo", "sup", "namaste", "hiya", "howdy"}
_FILLER = {
    "ok", "okay", "k", "kk", "yes", "yep", "yeah", "no", "nope", "nah", "hmm", "hm", "uh", "um",
    "test", "testing", "thanks", "thank", "thankyou", "thx", "ty", "bye", "goodbye", "cool", "nice",
    "good", "great", "lol", "haha", "sure", "fine", "right", "alright", "ping",
    # words that only ever pad a greeting or thanks ("good morning", "thank you so much", "hi there")
    "morning", "afternoon", "evening", "night", "there", "you", "so", "much", "very", "a", "lot",
    "all", "again", "bro", "dear", "buddy", "everyone", "team",
} | _GREETINGS


_THANKS = {"thanks", "thank", "thankyou", "thx", "ty"}
_TIME_OF_DAY = {"morning", "afternoon", "evening", "night"}


def short_input_kind(text: str):
    """None when `text` is long enough to treat as a note or a question,
    otherwise what kind of nothing it is: "thanks" ("thanks", "thank you so
    much"), "greeting" ("hi", "hello there", "good morning"), or "short"
    (too little to log or ask about: "ok", "test", "A", an emoji)."""
    words = [w.lower() for w in _WORD.findall(text or "")]
    if not words:
        return "short"  # empty, punctuation, emoji
    if all(w in _FILLER for w in words):
        if any(w in _THANKS for w in words):
            return "thanks"
        if words[0] in _GREETINGS or (words[0] == "good" and len(words) > 1 and words[1] in _TIME_OF_DAY):
            return "greeting"
        return "short"
    if len(words) == 1 and len(words[0]) < 3:
        return "short"  # a lone letter or two ("A", "hm", "42")
    return None
