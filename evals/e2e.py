"""End to end through the real API, as the app uses it: a real Supabase
sign-in, then /api/chat/stream for captures and questions (moderation,
intent, extraction, search index, agent - all real). Runs on the dedicated
eval account, wiped and re-seeded first, so results are comparable run to run."""

import json
import time
from datetime import date, timedelta

from evals.common import (EVAL_EMAIL, Case, Meter, Suite, dataset, ensure_user, pace, prepare_preferences, sign_in,
                          wipe_user_data)

import db
import search_index
from llm_client import FAST_MODEL_NAME, MODEL_NAME


def seed(user_id: str, data: dict) -> dict:
    """Initiatives, notes (bullet summaries) and tasks, dated relative to today."""
    ids = {name: db.create_initiative(user_id, name)["id"] for name in data["initiatives"]}
    today = date.today()
    for n in data["notes"]:
        nid = db.create_interaction(
            user_id, raw_text=n["summary"].replace("- ", "").replace("\n", ". "),
            date=(today + timedelta(days=n["day"])).isoformat(), summary=n["summary"],
            decisions=n.get("decisions", []), concerns=n.get("concerns", []), initiative_id=ids[n["initiative"]], topics=[],
        )
        for t in n["tasks"]:
            due = (today + timedelta(days=t["due"])).isoformat() if "due" in t else None
            task = db.create_task(user_id, nid, t["text"], due_date=due, owner=t.get("owner", "me"))
            if t.get("status") == "done":
                tid = task["id"] if isinstance(task, dict) else task
                db.get_client().table("task").update({"status": "done"}).eq("id", tid).execute()
    search_index.reindex_user(user_id)  # what the background indexer would have done
    return ids


class _Token:
    """A sign-in that renews itself: access tokens last an hour, and one slow
    or interrupted run (laptop asleep, network drop) shouldn't turn every
    later case into a 401."""

    def __init__(self):
        self._renew()

    def _renew(self):
        self.value, self.at = sign_in(EVAL_EMAIL), time.time()

    def __str__(self):
        if time.time() - self.at > 40 * 60:
            self._renew()
        return self.value


def _stream(client, token, text):
    r = client.post("/api/chat/stream", headers={"Authorization": f"Bearer {token}"}, json={"text": text, "history": []})
    stages, result, error = [], None, None
    for block in r.text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        data = json.loads(lines.get("data", "null"))
        if lines.get("event") == "stage":
            stages.append(data)
        elif lines.get("event") == "result":
            result = data
        elif lines.get("event") == "error":
            error = data
    return r.status_code, stages, result, error


def run(quick=False) -> tuple:
    from fastapi.testclient import TestClient

    from api.main import app

    data = dataset("e2e")
    setup = Suite("Setup", "Eval account reset and seed")
    qa = Suite("Questions (end to end)", "Answers from the user's own notes, through the real API. Each 'must' group "
               "needs one of its words; 'must_not' words would be invented.")
    cap = Suite("Captures (end to end)", "Notes sent through the real API are saved under the right initiative with their to-dos.")

    t = time.time()
    uid = ensure_user(EVAL_EMAIL)
    wipe_user_data(uid)
    prepare_preferences(uid)
    meter = Meter().start()
    ids = seed(uid, data)
    meter.stop(setup)
    token = _Token()
    setup.cases.append(Case("account reset, seeded and signed in", True,
                            f"{len(data['notes'])} notes, {len(ids)} initiatives in {time.time() - t:.1f}s"))

    with TestClient(app, raise_server_exceptions=False) as client:
        meter = Meter().start()
        for item in (data["qa"][:4] if quick else data["qa"]):
            pace(FAST_MODEL_NAME, 3500)
            pace(MODEL_NAME, 2500)
            t = time.time()
            status, stages, result, error = _stream(client, token, item["q"])
            ms = (time.time() - t) * 1000
            if error or not result:
                qa.cases.append(Case(item["q"], False, f"error: {(error or {}).get('detail', status)}"[:200], item.get("tag", ""), ms))
                continue
            answer = (result.get("answer") or "")
            low = answer.lower().replace("\u2019", "'").replace("\u2018", "'")  # curly apostrophes
            missing = [g for g in item["must"] if not any(w.lower() in low for w in g)]
            invented = [w for w in item.get("must_not", []) if w.lower() in low]
            leaked = "task:" in low or "note:" in low
            ok = result.get("intent") == "ask" and not missing and not invented and not leaked
            why = "ok" if ok else "; ".join(filter(None, [
                f"routed as {result.get('intent')}" if result.get("intent") != "ask" else "",
                f"missing {missing}" if missing else "", f"invented {invented}" if invented else "",
                "internal ref leaked" if leaked else ""]))
            qa.cases.append(Case(item["q"], ok, why + f" | answer: {answer[:160]!r}", item.get("tag", ""), ms))
        meter.stop(qa)

        meter = Meter().start()
        for item in (data["captures"][:1] + data["captures"][2:] if quick else data["captures"]):
            pace(MODEL_NAME, 4500)
            pace(FAST_MODEL_NAME, 2000)
            t = time.time()
            status, stages, result, error = _stream(client, token, item["text"])
            ms = (time.time() - t) * 1000
            if item.get("intent") == "blocked":
                ok = bool(result) and result.get("intent") == "blocked"
                cap.cases.append(Case(item["text"], ok, f"got {result and result.get('intent')}", "out-of-scope", ms))
                continue
            if error or not result:
                cap.cases.append(Case(item["text"], False, f"error: {(error or {}).get('detail', status)}"[:200], "", ms))
                continue
            problems = []
            if result.get("intent") != "capture":
                problems.append(f"routed as {result.get('intent')}")
            if result.get("initiative_name") not in item["initiative"]:
                problems.append(f"initiative {result.get('initiative_name')!r}")
            tasks = result.get("tasks_created") or []
            if len(tasks) != item["tasks"]:
                problems.append(f"{len(tasks)} tasks (expected {item['tasks']})")
            if [t["owner"] for t in tasks] != item["owners"][:len(tasks)]:
                problems.append(f"owners {[t['owner'] for t in tasks]}")
            if tasks and not all(t.get("due_date") for t in tasks):
                problems.append("deadline not resolved to a date")
            saved = [n for n in db.get_all_interactions(uid) if n["id"] == result.get("interaction_id")]
            if not saved:
                problems.append("note not in the database")
            elif not (saved[0].get("summary") or "").lstrip().startswith("- "):
                problems.append("saved summary is not bullet points")
            cap.cases.append(Case(item["text"], not problems, "; ".join(problems) or
                                  f"ok -> {result.get('initiative_name')}, tasks {[t['description'] for t in tasks]}", "", ms))
        meter.stop(cap)

    qa.metrics = {"median answer time": _median([c.ms for c in qa.cases])}
    cap.metrics = {"median capture time": _median([c.ms for c in cap.cases if c.tag != "out-of-scope"])}
    return setup, qa, cap


def _median(values):
    values = sorted(v for v in values if v)
    return f"{values[len(values) // 2] / 1000:.1f}s" if values else "-"
