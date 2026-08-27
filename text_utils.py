"""
text_utils.py - Cleans up "smart typography" Unicode characters the LLM
sometimes reaches for (a narrow no-break space U+202F between words in
names/dates, a non-breaking hyphen U+2011) instead of plain ASCII ones.
Most fonts render these as a barely-there gap or nothing at all, which is
what makes "Smith Desai" look like "SmithDesai" and dates look oddly
spaced. Applied to every LLM text output before it's stored or shown.
"""

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
