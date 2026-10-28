"""Runs every check and writes a report. Re-run any time to see whether the
app still works and what the free tier can handle.

    .venv/bin/python -m evals.run              # everything (~15-25 min, ~110K Groq tokens)
    .venv/bin/python -m evals.run --quick      # smaller samples (~6 min, ~35K tokens)
    .venv/bin/python -m evals.run --offline    # only the free tests (seconds, no tokens)
    .venv/bin/python -m evals.run --skip-load --base-url https://api.example.com

Writes reports/<date>-test-report.md (+ .json) and reports/latest.md.
Live evals use real Groq/Cohere on dedicated accounts (eval@ / load*@myconfia.local);
they spend part of the shared daily AI budget, so run them off-peak.
"""

import argparse
import json
import re
import subprocess
import sys
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from evals.common import ROOT, EVAL_EMAIL, Case, Suite, ensure_user

REPORTS = ROOT / "reports"


def offline_tests() -> list:
    suites = []
    t = time.time()
    py = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:warnings", "tests"], cwd=ROOT,
                        capture_output=True, text=True)
    s = Suite("Backend tests (offline)", "pytest - every external service stubbed; also runs in CI.")
    summary = (py.stdout.strip().splitlines() or [""])[-1]
    passed = int((re.search(r"(\d+) passed", summary) or [0, 0])[1])
    failed = int((re.search(r"(\d+) failed", summary) or [0, 0])[1])
    s.cases = []
    s.metrics = {"passed": passed, "failed": failed, "seconds": round(time.time() - t, 1)}
    for line in py.stdout.splitlines():
        if line.startswith("FAILED"):
            s.cases.append(Case(line.removeprefix("FAILED ").split(" - ")[0], False, line.split(" - ", 1)[-1][:200]))
    s.cases += [Case(f"test {i}", True) for i in range(passed)]
    suites.append(s)

    t = time.time()
    fe = subprocess.run(["npx", "vitest", "run"], cwd=ROOT / "frontend", capture_output=True, text=True,
                        env={**__import__("os").environ, "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"})
    s = Suite("Frontend tests (offline)", "vitest - notes as points, filters, colours, initiative order.")
    out = fe.stdout + fe.stderr
    m = re.search(r"Tests\s+(?:(\d+) failed \| )?(\d+) passed", out)
    if m:
        failed, passed = int(m[1] or 0), int(m[2])
        s.cases = [Case(f"test {i}", True) for i in range(passed)] + [Case(f"failed {i}", False) for i in range(failed)]
        s.metrics = {"passed": passed, "failed": failed, "seconds": round(time.time() - t, 1)}
    else:
        s.skipped = "vitest didn't run (is node installed and `npm ci` done in frontend/?)"
    suites.append(s)
    return suites


def _from_json(d: dict, note: str) -> Suite:
    s = Suite(d["name"], d["about"], [Case(**c) for c in d["cases"]], d.get("tokens") or {}, d.get("calls") or {},
              d.get("metrics") or {}, list(d.get("notes") or []) + [note], d.get("skipped") or "")
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--offline", action="store_true", help="only the free, offline tests")
    ap.add_argument("--skip-load", action="store_true")
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--only", default="", help="comma list of: intent,moderation,extraction,digest,e2e,load")
    ap.add_argument("--reuse", default="", help="earlier report .json to take the other suites' results from")
    args = ap.parse_args()
    only = {x.strip() for x in args.only.split(",") if x.strip()}
    reused = {s["name"]: s for s in json.loads(Path(args.reuse).read_text())["suites"]} if args.reuse else {}

    def wanted(key):
        return not only or key in only

    started = datetime.now()
    suites = offline_tests()
    capacity_result, storage, load_suite = None, {}, None
    if not args.offline:
        import observability
        from evals import capacity, components, e2e, load

        for key, name, fn in (("intent", "Intent routing", components.eval_intent),
                              ("moderation", "Safety check", components.eval_moderation),
                              ("extraction", "Note extraction", components.eval_extraction),
                              ("digest", "Initiative pages", components.eval_digest)):
            if wanted(key):
                print(f"running {fn.__name__} ...", flush=True)
                suites.append(fn(args.quick))
            elif name in reused:
                suites.append(_from_json(reused[name], f"reused from {args.reuse}"))
        print("running end-to-end ...", flush=True)
        n_before = len(observability.recent_events())
        setup, qa, cap = e2e.run(args.quick)
        e2e_events = observability.recent_events()[n_before:]
        suites += [setup, qa, cap]
        storage = capacity.measure_storage(ensure_user(EVAL_EMAIL))
        if args.skip_load or not wanted("load"):
            if "Load & limits" in reused:
                load_suite = _from_json(reused["Load & limits"], f"reused from {args.reuse}")
                suites.append(load_suite)
        else:
            print("running load & limits ...", flush=True)
            load_suite = load.run(args.base_url, args.quick)
            suites.append(load_suite)
        # Cohere per capture = every Cohere call in the capture suite's own window
        # (the in-request embedding + the background search indexing it triggers),
        # minus the part already attributed to the request.
        captures = sum(1 for c in cap.cases if c.tag != "out-of-scope")
        attributed = sum(1 for e in e2e_events if e["kind"] == "cohere" and (e.get("detail") or {}).get("req"))
        cap_cohere = sum(n for k, n in cap.calls.items() if k.startswith("cohere:"))
        in_request = capacity.cost_per_action(e2e_events).get("capture", {}).get("cohere", 0)
        bg_per_capture = round(max(0, cap_cohere / captures - in_request), 2) if captures else 0
        payload = None
        if load_suite and load_suite.metrics.get("notes_scaling"):
            sc = {int(k): v for k, v in load_suite.metrics["notes_scaling"].items()}  # keys are str when reused
            smallest = min(sc)
            payload = sc[smallest]["payload_kb"] * 100 / smallest
        capacity_result = capacity.model(e2e_events, bg_per_capture, storage, payload)
        capacity_result["cohere_attributed_calls"] = attributed
        observability.flush()

    REPORTS.mkdir(exist_ok=True)
    stamp = started.strftime("%Y-%m-%d")
    data = {"started": started.isoformat(timespec="seconds"), "minutes": round((datetime.now() - started).seconds / 60, 1),
            "mode": "offline" if args.offline else ("quick" if args.quick else "full"),
            "suites": [asdict(s) | {"score": s.score, "passed": s.passed} for s in suites],
            "capacity": capacity_result, "storage": storage}
    (REPORTS / f"{stamp}-test-report.json").write_text(json.dumps(data, indent=2, default=str))
    from evals.report import render

    md = render(data)
    (REPORTS / f"{stamp}-test-report.md").write_text(md)
    (REPORTS / "latest.md").write_text(md)
    failed = sum(len(s["cases"]) - s["passed"] for s in data["suites"])
    print(f"\nreport: reports/{stamp}-test-report.md  ({failed} failing checks)")


if __name__ == "__main__":
    main()
