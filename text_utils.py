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
