"""Live evals of the individual AI steps (real Groq): intent routing, the
safety check, note extraction, and initiative pages."""

import time
from collections import Counter
from datetime import date

from evals.common import Case, Meter, Suite, dataset, pace, retry_on_limit, words

import date_utils
import extraction
import initiative_digest
import intent
import moderation
from llm_client import FAST_MODEL_NAME, MODEL_NAME


def _subset(cases, quick, n):
    return cases[::max(1, len(cases) // n)][:n] if quick else cases


def eval_intent(quick=False) -> Suite:
    data = dataset("intent")
    suite = Suite("Intent routing", data["about"])
    confusion = Counter()
    meter = Meter().start()
    for c in _subset(data["cases"], quick, 12):
        if intent.fast_classify(c["text"]) is None:
            pace(FAST_MODEL_NAME, 900)
        t = time.time()
        got = retry_on_limit(intent.classify, c["text"])
        confusion[(c["expect"], got)] += 1
        suite.cases.append(Case(c["text"], got == c["expect"], f"expected {c['expect']}, got {got}",
                                c.get("tag", ""), (time.time() - t) * 1000))
    meter.stop(suite)
    refused = confusion[("capture", "out_of_scope")]
    total_capture = sum(v for (exp, _), v in confusion.items() if exp == "capture")
    suite.metrics = {
        "notes wrongly refused (capture -> out_of_scope)": f"{refused}/{total_capture}",
        "free fast-path routes (no LLM call)": sum(1 for c in _subset(data["cases"], quick, 12) if intent.fast_classify(c["text"])),
        "confusion": {f"{a} -> {b}": n for (a, b), n in sorted(confusion.items())},
    }
    return suite


def eval_moderation(quick=False) -> Suite:
    data = dataset("moderation")
    suite = Suite("Safety check", data["about"])
    meter = Meter().start()
    over = under = unavailable = 0
    judged_by = Counter()
    import observability

    for c in _subset(data["cases"], quick, 6):
        pace(FAST_MODEL_NAME, 1500)  # the fallback judge's per-minute budget
        before = len(observability.recent_events())
        t = time.time()
        r = moderation.check(c["text"])
        used = [e["model"] for e in observability.recent_events()[before:] if e["kind"] == "llm"]
        judged_by[used[-1].replace("openai/gpt-oss-", "") if used else "local screen"] += 1
        got = "unavailable" if r.get("unavailable") else ("safe" if r["safe"] else "unsafe")
        if got == "unavailable":
            unavailable += 1
        elif c["expect"] == "safe" and got == "unsafe":
            over += 1
        elif c["expect"] == "unsafe" and got == "safe":
            under += 1
        detail = f"expected {c['expect']}, got {got}" + (f" ({r.get('category')})" if r.get("category") else "")
        suite.cases.append(Case(c["text"], got == c["expect"], detail, c.get("tag", ""), (time.time() - t) * 1000))
    meter.stop(suite)
    suite.metrics = {"real notes blocked (false positives)": over, "harmful let through (false negatives)": under,
                     "check unavailable": unavailable, "judged by": dict(judged_by)}
    suite.notes.append("The safeguard model allows ~3 requests/minute for the whole account; past that the check "
                       "falls back to gpt-oss-20b with the same policy, so both are exercised here.")
    return suite


def _find_task(tasks, match, owner=None):
    """The extracted task for an expected one: mentions one of the keywords,
    preferring the one with the expected owner (a name can appear in two)."""
    hits = [t for t in tasks if any(m in (t.get("description") or "").lower() for m in match)]
    return next((t for t in hits if t.get("owner") == owner), None)


_STOP = {"a", "an", "the", "to", "for", "of", "on", "in", "with", "and", "my", "me", "by", "from", "about", "her", "his", "their"}


def _repeats_todo(point: str, task: str) -> bool:
    """A point repeats a to-do when most of the to-do's words are in it."""
    want = {w for w in task.lower().replace(",", " ").split() if w not in _STOP}
    have = set(point.lower().replace(",", " ").replace(":", " ").split())
    return bool(want) and len(want & have) / len(want) >= 0.6


DEADLINE_WORDS = ("by friday", "by monday", "tomorrow", "by sunday", "next monday", "this weekend", "by 5pm", "before december")


def eval_extraction(quick=False) -> Suite:
    data = dataset("extraction")
    ref = date.fromisoformat(data["reference_date"])
    suite = Suite("Note extraction", data["about"])
    meter = Meter().start()
    point_lengths, point_counts = [], []
    for c in _subset(data["cases"], quick, 3):
        pace(MODEL_NAME, 4500)
        t = time.time()
        problems = []
        try:
            out = retry_on_limit(extraction.extract_info, c["text"], ref, data["initiatives"])
        except Exception as e:
            suite.cases.append(Case(c["id"], False, f"extraction failed: {type(e).__name__}: {e}"[:200]))
            continue
        ms = (time.time() - t) * 1000
        if out.get("initiative") not in c["initiative"]:
            problems.append(f"initiative {out.get('initiative')!r} (expected one of {c['initiative']})")
        summary = out.get("summary") or ""
        lines = [l.strip() for l in summary.splitlines() if l.strip()]
        if not lines or not all(l.startswith("- ") for l in lines):
            problems.append("summary is not '- ' bullet points")
        point_counts.append(len(lines))
        for l in lines:
            point_lengths.append(words(l[2:]))
        if len(lines) > 4:
            problems.append(f"{len(lines)} points (max 4)")
        if any(words(l[2:]) > 16 for l in lines):
            problems.append("a point is over 16 words")
        if "the user" in summary.lower():
            problems.append("says 'the user'")
        tasks = out.get("follow_ups") or []
        for exp in c["tasks"]:
            found = _find_task(tasks, exp["match"], exp["owner"])
            if not found:
                who = "they owe me" if exp["owner"] == "them" else "I owe"
                problems.append(f"missing '{who}' task about {exp['match'][0]!r}")
                continue
            if found.get("owner") != exp["owner"]:
                problems.append(f"task {exp['match'][0]!r} owner {found.get('owner')} (expected {exp['owner']})")
            if "due" in exp:
                due = date_utils.resolve_relative_phrase(found.get("due_date"), ref)
                if due != exp["due"]:
                    problems.append(f"task {exp['match'][0]!r} due {due} from {found.get('due_date')!r} (expected {exp['due']})")
            if "time" in exp and date_utils.to_valid_time(found.get("due_time")) != exp["time"]:
                problems.append(f"task {exp['match'][0]!r} time {found.get('due_time')!r} (expected {exp['time']})")
            if any(w in (found.get("description") or "").lower() for w in DEADLINE_WORDS):
                problems.append(f"deadline words left in task text: {found.get('description')!r}")
            # a note that is ONLY a to-do is meant to have one point naming it
            if not c.get("todo_only") and any(_repeats_todo(l[2:], found.get("description") or "") for l in lines):
                problems.append(f"to-do repeated in the points: {found.get('description')!r}")
        extra = len(tasks) - len(c["tasks"])
        if extra > 0 and not c.get("allow_extra_tasks"):
            problems.append(f"{extra} unexpected task(s): {[t.get('description') for t in tasks][:3]}")
        for name in c.get("names", []):
            blob = summary + " ".join(t.get("description") or "" for t in tasks)
            if name.lower() in blob.lower() and name not in blob:
                problems.append(f"name not capitalised: {name}")
        if c.get("expect_decisions") and not out.get("decisions"):
            problems.append("no decision captured")
        if c.get("expect_concerns") and not out.get("concerns"):
            problems.append("no concern captured")
        suite.cases.append(Case(c["id"], not problems, "; ".join(problems) or "ok", "", ms))
    meter.stop(suite)
    if point_lengths:
        suite.metrics = {
            "points per note (avg)": round(sum(point_counts) / len(point_counts), 1),
            "words per point (avg / max)": f"{sum(point_lengths) / len(point_lengths):.1f} / {max(point_lengths)}",
        }
    return suite


IC_NOTES = [
    "- Case: mid-size Indian logistics company, Series C\n- Revenue Rs 420 Cr, growing 38% YoY\n- EBITDA margin thin at 4%",
    "- Thesis: consolidation play in fragmented B2B freight\n- Moat is the route-density network, not the tech",
    "- Comps trade at 2.5-3x revenue\n- DCF gives Rs 1,350 Cr at 13% WACC\n- Terminal growth of 6% feels aggressive",
    "- Top 5 clients are 46% of revenue\n- Fuel cost pass-through only partial",
    "- Partner feedback: valuation fine, risks section too thin\n- Add a downside case with top client churn",
]
IC_FACTS = [["route", "density"], ["1,350", "1350"], ["46"], ["consolidation", "fragmented"], ["ebitda", "4%"]]


def eval_digest(quick=False) -> Suite:
    """The initiative page: sections that fit the subject, short points,
    no repeats, and the key facts kept. Runs the real model on fixed notes."""
    suite = Suite("Initiative pages", "initiative_digest: organises an initiative's notes into short titled sections.")
    notes = [{"id": i + 1, "summary": s, "decisions": [], "concerns": [], "initiative_id": 1, "date": f"2026-10-{20 + i}"}
             for i, s in enumerate(IC_NOTES)]
    pace(FAST_MODEL_NAME, 4500)
    meter = Meter().start()
    t = time.time()
    try:
        d = retry_on_limit(initiative_digest._write, notes, "IC case study")
    except Exception as e:
        suite.cases.append(Case("organise IC case study", False, f"failed: {e}"[:200]))
        meter.stop(suite)
        return suite
    ms = (time.time() - t) * 1000
    meter.stop(suite)
    sections = d["sections"]
    points = [p for s in sections for p in s["points"]]
    text = " ".join(points).lower()
    suite.cases += [
        Case("2-5 titled sections", 2 <= len(sections) <= 5, f"{len(sections)}: {[s['title'] for s in sections]}", ms=ms),
        Case("no generic titles", not any(s["title"].lower() in ("misc", "other", "notes", "other notes") for s in sections),
             str([s["title"] for s in sections])),
        Case("points are short (<=14 words)", all(words(p) <= 14 for p in points), f"max {max(map(words, points))} words"),
        Case("no point repeated", len(points) == len({p.lower() for p in points}), f"{len(points)} points"),
        Case("no to-dos in the page", not any(p.lower().startswith(("add ", "send ", "write ", "collect ")) for p in points),
             str([p for p in points if p.lower().startswith(("add ", "send ", "write ", "collect "))])),
    ]
    for facts in IC_FACTS:
        suite.cases.append(Case(f"keeps fact: {facts[0]}", any(f in text for f in facts), "found" if any(f in text for f in facts) else "missing"))
    suite.metrics = {"sections": [s["title"] for s in sections], "points": len(points)}
    return suite
