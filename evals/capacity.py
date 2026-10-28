"""How many users the free tier supports, and which limit runs out first.

Inputs, all measured in this run unless marked otherwise:
  - AI cost per capture / per question, per model (tokens and calls), from
    the end-to-end eval's real requests (observability events grouped by
    request id - the same method as the admin page);
  - Groq's limits per model from its own response headers (tokens/minute,
    requests/day); tokens/day isn't in the headers, so the documented
    free-tier value is used;
  - Cohere calls per action; storage per note; Notes payload size;
  - per-user monthly caps from entitlements.FREE_LIMITS.
Free-tier limits of the other services are documented values (FREE_TIER).
"""

from collections import Counter, defaultdict

import entitlements
import llm_budget
import observability

# Documented free-tier limits (checked Oct 2026 - re-check if a provider changes plans).
FREE_TIER = {
    "groq_tpd": 200_000,  # tokens/day per model (not exposed in headers)
    "groq_rpm": 30,  # requests/minute per model
    "safeguard_rpm": 3,  # moderation model: requests/minute for the whole account (moderation.py)
    "cohere_calls_month": 1_000,  # trial key, all endpoints
    "cohere_rerank_per_min": 10,
    "supabase_db_mb": 500,
    "supabase_egress_gb_month": 5,
    "supabase_mau": 50_000,
    "render_ram_mb": 512,
    "resend_per_day": 100,
    "resend_per_month": 3_000,
    "actions_minutes_month_private": 2_000,
}

# Typical day for one ACTIVE user.
PROFILES = {
    "light": {"capture": 2, "question": 1, "screen_loads": 6},
    "regular": {"capture": 5, "question": 3, "screen_loads": 15},
    "heavy": {"capture": 12, "question": 8, "screen_loads": 30},
}

ACTIONS = {"interactions_logged": "capture", "ai_questions_asked": "question"}


def cost_per_action(events) -> dict:
    """{action: {"samples", "tokens": {model: avg}, "calls": {model: avg}, "cohere": avg}} from real requests."""
    action_of, per_req = {}, defaultdict(lambda: {"tokens": Counter(), "calls": Counter(), "cohere": 0})
    for e in events:
        req = (e.get("detail") or {}).get("req")
        if not req:
            continue
        if e["kind"] == "usage" and e["name"] in ACTIONS:
            action_of[req] = ACTIONS[e["name"]]
        elif e["kind"] == "llm":
            per_req[req]["tokens"][e["model"]] += e["tokens"] or 0
            per_req[req]["calls"][e["model"]] += 1
        elif e["kind"] == "cohere":
            per_req[req]["cohere"] += 1
    out = {}
    for action in ("capture", "question"):
        reqs = [per_req[r] for r, a in action_of.items() if a == action and per_req[r]["tokens"]]
        if not reqs:
            continue
        models = {m for r in reqs for m in r["tokens"]}
        out[action] = {
            "samples": len(reqs),
            "tokens": {m: round(sum(r["tokens"][m] for r in reqs) / len(reqs)) for m in models},
            "calls": {m: round(sum(r["calls"][m] for r in reqs) / len(reqs), 2) for m in models},
            "cohere": round(sum(r["cohere"] for r in reqs) / len(reqs), 2),
        }
    return out


def groq_limits() -> dict:
    """Per model: tokens/minute and requests/day as Groq reported them."""
    out = {}
    for model, s in llm_budget.snapshot().items():
        out[model] = {"tpm": s.get("limit_tpm"), "rpd": s.get("limit_rpd"), "tpd": FREE_TIER["groq_tpd"]}
    return out


def model(events, background_cohere_per_capture: float, storage: dict, notes_payload_kb_per_100: float) -> dict:
    costs = cost_per_action(events)
    limits = groq_limits()
    caps = {ACTIONS[k]: v for k, v in entitlements.FREE_LIMITS.items() if k in ACTIONS}
    result = {"costs": costs, "limits": limits, "caps": caps, "free_tier": FREE_TIER, "profiles": {},
              "cohere_background_per_capture": background_cohere_per_capture}
    if not costs:
        return result
    cap_c = costs.get("capture", {})
    cap_q = costs.get("question", {})
    cohere_per = {"capture": cap_c.get("cohere", 0) + background_cohere_per_capture, "question": cap_q.get("cohere", 0)}

    # ---- burst: how many of each action fit in ONE minute (Groq TPM per model) ----
    # The safety check's own model allows only ~3 requests/minute for the whole
    # account; in a burst it falls back to the small model (moderation.py), so
    # its tokens are charged to that model here instead.
    burst = {}
    for action, c in costs.items():
        per_model = {}
        tokens = dict(c["tokens"])
        guard = next((m for m in tokens if "safeguard" in m), None)
        small = next((m for m in tokens if m.endswith("gpt-oss-20b")), None)
        if guard and small:
            tokens[small] += tokens.pop(guard)
        for m, tok in tokens.items():
            tpm = (limits.get(m) or {}).get("tpm")
            if tpm and tok:
                per_model[m] = tpm / tok
        if per_model:
            binding = min(per_model, key=per_model.get)
            burst[action] = {"per_minute": round(per_model[binding], 1), "binding_model": binding}
    result["burst"] = burst

    # ---- per day / per month for each usage profile, with and without the monthly caps ----
    for name, p in PROFILES.items():
        result["profiles"][name] = {
            "per_day": p,
            "with_caps": _profile(p, costs, limits, caps, cohere_per, storage, notes_payload_kb_per_100),
            "without_caps": _profile(p, costs, limits, {}, cohere_per, storage, notes_payload_kb_per_100),
        }
    return result


def _profile(p, costs, limits, caps, cohere_per, storage, notes_payload_kb_per_100) -> dict:
    eff = {a: min(p[a], caps.get(a, 10**9) / 30) for a in ("capture", "question")}  # caps limit what a user can do
    constraints = {}
    for m in {m for c in costs.values() for m in c["tokens"]}:
        tok = sum(eff[a] * costs.get(a, {}).get("tokens", {}).get(m, 0) for a in eff)
        calls = sum(eff[a] * costs.get(a, {}).get("calls", {}).get(m, 0) for a in eff)
        lim = limits.get(m) or {}
        if tok:
            constraints[f"Groq tokens/day - {m.split('/')[-1]}"] = (lim.get("tpd") or FREE_TIER["groq_tpd"]) / tok
        if calls and lim.get("rpd"):
            constraints[f"Groq requests/day - {m.split('/')[-1]}"] = lim["rpd"] / calls
    cohere_month = 30 * sum(eff[a] * cohere_per[a] for a in eff)
    if cohere_month:
        constraints["Cohere calls/month (trial key)"] = FREE_TIER["cohere_calls_month"] / cohere_month
    if storage.get("bytes_per_note") and eff["capture"]:
        mb_per_user_year = 12 * 30 * eff["capture"] * storage["bytes_per_note"] / 1e6
        constraints["Supabase 500 MB database (a year of notes)"] = FREE_TIER["supabase_db_mb"] / mb_per_user_year
    if notes_payload_kb_per_100:
        gb_month = 30 * p["screen_loads"] * notes_payload_kb_per_100 / 1e6  # ~100 notes per user on average
        constraints["Supabase 5 GB egress/month"] = FREE_TIER["supabase_egress_gb_month"] / gb_month
    # the safeguard model is a soft limit: when it runs out the check falls back to 20b
    hard = {k: v for k, v in constraints.items() if "safeguard" not in k}
    binding = min(hard, key=hard.get)
    return {
        "effective_per_day": {a: round(v, 2) for a, v in eff.items()},
        "capped": {a: eff[a] < p[a] for a in eff},
        "users_by_constraint": {k: int(v) for k, v in sorted(constraints.items(), key=lambda kv: kv[1])},
        "max_active_users": int(hard[binding]),
        "binding": binding,
    }


def measure_storage(user_id) -> dict:
    """Bytes a note really takes: its encrypted row + its search-index rows
    (text + 1024-dim float4 vector, plus roughly the same again for the
    vector index)."""
    import json

    import db

    c = db.get_client()
    notes = c.table("interaction").select("raw_text,summary,location,topics,decisions,concerns,embedding") \
        .eq("user_id", user_id).execute().data
    tasks = c.table("task").select("description").eq("user_id", user_id).execute().data
    chunks = c.table("search_chunk").select("title,text,kind").eq("user_id", user_id).execute().data
    if not notes:
        return {}
    vec = 1024 * 4
    text_note = sum(len(json.dumps({k: v for k, v in n.items() if k != "embedding"})) for n in notes) / len(notes)
    note_vec = vec  # every captured note stores its own embedding (seeded eval notes skip it)
    task_bytes = (sum(len(t["description"] or "") for t in tasks) + 200 * len(tasks)) / len(notes)
    chunk_bytes = (sum(len((ch.get("title") or "") + (ch.get("text") or "")) + 2 * vec + 200 for ch in chunks)) / len(notes)
    per_note = text_note + 200 + note_vec + task_bytes + chunk_bytes
    return {"bytes_per_note": round(per_note), "notes_sampled": len(notes), "chunks_per_note": round(len(chunks) / len(notes), 2),
            "tasks_per_note": round(len(tasks) / len(notes), 2)}
