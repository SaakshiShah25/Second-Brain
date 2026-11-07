"""
commands.py — Messages that are an instruction TO THE APP, not something to log: "create a reading list in
Personal", "make a new space called Health". They are read in plain code (no LLM call) before a message is
classified, because otherwise they are saved as a to-do ("Create a reading list") and nothing is created.

parse() only recognises a clear instruction to make a list or a space; anything else comes back None and goes the
usual way. A command may be followed by something to add - "create a reading list in Personal and add Dune" -
which comes back as `then`, to be captured as an ordinary message once the list exists.

Nothing here touches the database; api/routers/chat.py carries the command out.
"""

import re
from typing import Optional

_POLITE = r"^\s*(?:(?:hey\s+)?(?:confi[aá]\s*,?\s*)?)(?:(?:please|can\s+you|could\s+you|would\s+you|i\s+want\s+(?:you\s+)?to|i(?:'d|\s+would)\s+like\s+(?:you\s+)?to|let'?s)\s+)*"
_MAKE = r"(?:create|make|start|set\s+up|add)"
_ART = r"(?:me\s+)?(?:a\s+|an\s+|the\s+|my\s+)?(?:new\s+|another\s+)?"
_WHERE = r"(?:\s+(?:in|under|inside|within|into|to|for)\s+(?:my\s+|the\s+)?(?P<space>[\w'& -]+?)(?:\s+(?:space|area|initiative|category|folder))?)?"
_NAME = r"[\w'&-]+(?:\s+[\w'&-]+){0,3}?"

# "create a list called Reading" / "make a list for groceries in Personal"
_LIST_CALLED = re.compile(rf"{_POLITE}{_MAKE}\s+{_ART}(?:list|label)\s+(?:called|named|for)\s+['\"“]?(?P<name>{_NAME})['\"”]?{_WHERE}\s*[.!]?\s*$", re.I)
# "create a reading list" / "make a new movies list in Personal" - not "add": "add milk to my shopping list" is a capture
_LIST_PLAIN = re.compile(rf"{_POLITE}(?:create|make|start|set\s+up)\s+{_ART}(?P<name>{_NAME})\s+list{_WHERE}\s*[.!]?\s*$", re.I)
# "create a space called Health" (space / category / folder / area); initiative and project need a name given with "called"
_SPACE = re.compile(
    rf"{_POLITE}{_MAKE}\s+{_ART}(?:(?:space|category|folder|area)(?:\s+(?:called|named|for))?|(?:initiative|project)\s+(?:called|named))\s+"
    rf"['\"“]?(?P<name>{_NAME})['\"”]?\s*[.!]?\s*$",
    re.I,
)
# Something more to do once the command is done: "..., and add Dune" / "then put Sapiens"
_THEN = re.compile(r"\s*(?:,|;|\.|\band\b|\bthen\b)\s+(?=(?:also\s+)?(?:add|put)\b)", re.I)

# "...and add it to the Personal space": says where the list goes, it is not something else to capture
_PLACE_IT = re.compile(
    r"^(?:also\s+)?(?:add|put|file|move|keep)\s+(?:it|that|this|the\s+list)\s+(?:to|in|into|under|inside)\s+(?:my\s+|the\s+)?"
    r"(?P<space>[\w'& -]+?)(?:\s+(?:space|area|initiative|category|folder))?\s*[.!]?$",
    re.I,
)

_NOT_A_NAME = {"to", "do", "to do", "to-do", "todo", "task", "tasks", "new", "my", "a", "an", "the"}


def _tidy(name: str) -> str:
    name = " ".join((name or "").strip(" .,'\"“”").split())
    return name[:1].upper() + name[1:]


def parse(text: str) -> Optional[dict]:
    """{"kind": "create_list", "name", "space"?, "then"?} or {"kind": "create_space", "name", "then"?}; else None."""
    raw = " ".join((text or "").split())
    if not raw or len(raw) > 200:
        return None
    head, then = raw, ""
    split = _THEN.search(raw)
    if split:
        head, then = raw[: split.start()], raw[split.end():].strip()
    for pattern, kind in ((_LIST_CALLED, "create_list"), (_LIST_PLAIN, "create_list"), (_SPACE, "create_space")):
        m = pattern.match(head)
        if not m:
            continue
        name = _tidy(m.group("name"))
        if not name or name.lower() in _NOT_A_NAME:
            return None
        if pattern is _LIST_PLAIN:
            name = list_title(name)  # "create a reading list" -> "Reading list"
        out = {"kind": kind, "name": name}
        if kind == "create_list" and m.groupdict().get("space"):
            out["space"] = _tidy(m.group("space"))
        placed = _PLACE_IT.match(then) if then and kind == "create_list" else None
        if placed:
            out["space"] = _tidy(placed.group("space"))
        elif then:
            out["then"] = then
        return out
    return None


def list_title(name: str) -> str:
    """"Reading" -> "Reading list"; a name that already says list/label is left alone."""
    return name if re.search(r"\b(?:list|label)\b", name, re.I) else f"{name} list"
