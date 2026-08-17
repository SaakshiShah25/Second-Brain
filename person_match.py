"""
person_match.py — Shared fuzzy person-matching logic, used by both
capture.py (deciding whether to merge a mentioned name into an existing
Person or create a new one) and retrieval.py (resolving which existing
Person a query is asking about).

Matching is intentionally conservative: nicknames aren't unique (e.g. "Sid"
could be short for a "Sidharth" met months ago, or a different new person
also called Sid), so this only SCORES candidates - the caller decides what
to do with ambiguity (capture.py asks before merging/creating; retrieval.py
asks before answering about the wrong person).
"""

import difflib

CANDIDATE_THRESHOLD = 0.5
MAX_CANDIDATES_SHOWN = 3


def score_candidates(name: str, people: list, threshold: float = CANDIDATE_THRESHOLD,
                      max_results: int = MAX_CANDIDATES_SHOWN):
    """
    Return [(person, score), ...] for every person in `people` whose name or
    any alias is at least `threshold` similar to `name`, sorted best-first
    and capped at `max_results`.
    """
    scored = []
    for person in people:
        candidates = [person["name"]] + (person.get("aliases") or [])
        best_for_person = max(
            difflib.SequenceMatcher(None, name.lower(), c.lower()).ratio()
            for c in candidates
        )
        if best_for_person >= threshold:
            scored.append((person, best_for_person))
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:max_results]


def find_confident_match(name: str, people: list, threshold: float = 0.9):
    """
    Returns the single existing person whose name/alias matches `name`
    with confidence >= threshold, or None if there's no such confident
    match - either no candidate clears the bar, or more than one does
    (genuinely ambiguous). Used for auto-linking secondary ("other_people")
    mentions during capture, where there's no human in the loop to catch a
    wrong guess - unlike the primary person, which always asks (see
    capture.py's resolve_person). A missed match here just means a new
    Person gets created, which can be merged later via the People page if
    it turns out to be a duplicate.
    """
    candidates = score_candidates(name, people, threshold=threshold, max_results=2)
    if len(candidates) == 1:
        return candidates[0][0]
    return None
