"""
search_index.py — The unified retrieval index: one searchable layer over
the user's notes and follow-ups.

Write side ("indexer")
    Every source row becomes a short, self-contained chunk of text plus
    filterable metadata (date, initiative), embedded with Cohere and stored
    in `search_chunk` (schema.sql section 28). Chunks are DERIVED data: the
    source tables stay the truth, chunks are rebuilt from them on every
    write (enqueue(), from a background worker so capture latency doesn't
    change) and wholesale by reindex_user().

Read side ("search")
    Hybrid retrieval, then rerank:
      1. vector similarity in SQL (match_search_chunks) - finds meaning
         ("worried about cost" ~ "pricing concerns");
      2. BM25 keyword scoring in Python over the decrypted chunk text -
         finds exact things embeddings blur (names, "INV-031", amounts);
         in Python because chunk text is encrypted at rest;
      3. reciprocal-rank fusion of the two lists, then Cohere's reranker
         orders the top candidates by how well they actually answer.
    Filters (kinds, initiative, date range) apply to both sides.
"""


import math
import queue
import re
import threading
from collections import Counter
from datetime import datetime, timezone
from typing import Optional

import db
import embeddings

KINDS = ("note", "task")


# ---------------------------------------------------------------- chunk text

def _join(label: str, items) -> str:
    items = [str(i) for i in (items or []) if i]
    return f"{label}: " + "; ".join(items) if items else ""


def _note_chunk(n: dict) -> dict:
    initiative = (n.get("initiative") or {}).get("name")
    title = f"Note · {n.get('date') or 'undated'}" + (f" · {initiative}" if initiative else "")
    text = "\n".join(p for p in [
        title,
        f"Location: {n['location']}" if n.get("location") else "",
        f"Summary: {n.get('summary') or ''}",
        _join("Decisions", n.get("decisions")),
        _join("Concerns", n.get("concerns")),
        _join("Topics", n.get("topics")),
        f"What was said: {(n.get('raw_text') or '')[:2500]}",
    ] if p)
    return {"kind": "note", "entity_id": n["id"], "title": title, "text": text, "item_date": n.get("date"),
            "person_ids": [], "initiative_id": n.get("initiative_id"), "meta": {}}


def _task_chunk(t: dict) -> dict:
    inter = t.get("interaction") or {}
    owner = "I owe this" if t.get("owner") == "me" else "Someone else owes this to me"
    title = f"Task · {t.get('description', '')[:60]}"
    text = "\n".join(p for p in [
        f"Task ({t.get('status')}) - {owner}" + (f", due {t['due_date']}" + (f" at {str(t['due_time'])[:5]}" if t.get("due_time") else "")
                                           if t.get("due_date") else ", no due date"),
        t.get("description", ""),
        f"From a note on {inter.get('date')}: {inter.get('summary') or ''}" if inter else "",
    ] if p)
    return {"kind": "task", "entity_id": t["id"], "title": title, "text": text,
            "item_date": t.get("due_date") or inter.get("date"), "person_ids": [],
            "initiative_id": (inter.get("initiative") or {}).get("id"),
            "meta": {"status": t.get("status"), "owner": t.get("owner")}}


def _build(user_id: str, wanted: Optional[dict] = None) -> list:
    """Chunks for the given {kind: {ids}} (or everything when None)."""
    def want(kind):
        return wanted is None or kind in wanted

    def keep(kind, _id):
        return wanted is None or _id in wanted.get(kind, set())

    chunks = []
    if want("note"):
        chunks += [_note_chunk(n) for n in db.get_all_interactions_with_context(user_id) if keep("note", n["id"])]
    if want("task"):
        chunks += [_task_chunk(t) for t in db.get_all_tasks_with_context(user_id) if keep("task", t["id"])]
    return chunks


def _write(user_id: str, chunks: list) -> None:
    vectors = embeddings.compute_embeddings([c["text"] for c in chunks])
    now = datetime.now(timezone.utc).isoformat()
    for c, v in zip(chunks, vectors):
        c["embedding"] = v
        c["updated_at"] = now  # the column default only applies on insert, not on upsert-update
    db.upsert_search_chunks(user_id, chunks)


def prune(user_id: str) -> int:
    """Removes chunks whose source row no longer exists (deleted notes and
    their cascaded tasks), plus any chunk of a kind this app no longer
    indexes. Cheap: compares ids, no embeddings."""
    live = {
        "note": {n["id"] for n in db.get_all_interactions(user_id)},
        "task": {t["id"] for t in db.get_all_tasks_with_context(user_id)},
    }
    stale: dict = {}
    for row in db.get_search_chunk_keys(user_id):
        if row["entity_id"] not in live.get(row["kind"], set()):
            stale.setdefault(row["kind"], []).append(row["entity_id"])
    for kind, ids in stale.items():
        db.delete_search_chunks(user_id, kind, ids)
    return sum(len(v) for v in stale.values())


def reindex_user(user_id: str) -> int:
    """Rebuilds every chunk for one account (backfill / repair)."""
    chunks = _build(user_id)
    _write(user_id, chunks)
    prune(user_id)
    return len(chunks)


# ---------------------------------------------------------------- background updates

_queue: "queue.Queue[tuple]" = queue.Queue()
_worker_started = False
_worker_lock = threading.Lock()


def enqueue(user_id: str, kind: str, entity_ids, prune_after: bool = False) -> None:
    """Schedules (re)indexing after a write - non-blocking, so capture and
    edits stay as fast as before. Safe to call with ids that were just
    deleted (they're simply skipped, and prune_after cleans up)."""
    global _worker_started
    ids = [entity_ids] if isinstance(entity_ids, int) else [i for i in (entity_ids or []) if i is not None]
    _queue.put((user_id, kind, tuple(ids), prune_after))
    with _worker_lock:
        if not _worker_started:
            threading.Thread(target=_worker, daemon=True).start()
            _worker_started = True


def _worker() -> None:
    while True:
        first = _queue.get()
        batch = [first]
        try:
            while True:
                batch.append(_queue.get(timeout=0.5))  # coalesce bursts (a capture touches several rows)
        except queue.Empty:
            pass
        by_user: dict = {}
        for user_id, kind, ids, prune_after in batch:
            entry = by_user.setdefault(user_id, {"wanted": {}, "prune": False})
            entry["wanted"].setdefault(kind, set()).update(ids)
            entry["prune"] |= prune_after
        for user_id, entry in by_user.items():
            try:
                wanted = {k: v for k, v in entry["wanted"].items() if v}
                if wanted:
                    _write(user_id, _build(user_id, wanted))
                if entry["prune"]:
                    prune(user_id)
            except Exception as e:  # never kill the worker; reindex_user repairs anything missed
                print(f"[warn] search index update failed for {user_id}: {e}")


# ---------------------------------------------------------------- search

def _tokens(s: str) -> list:
    out = []
    for t in re.split(r"[^a-z0-9]+", (s or "").lower()):
        if len(t) > 1:
            out.append(t[:-1] if len(t) > 4 and t.endswith("s") and not t.endswith("ss") else t)
    return out


def _bm25(query: str, rows: list, k1: float = 1.2, b: float = 0.75) -> dict:
    q = set(_tokens(query))
    if not q or not rows:
        return {}
    docs = [Counter(_tokens(r["text"])) for r in rows]
    avg = sum(sum(d.values()) for d in docs) / len(docs) or 1
    df = Counter(t for d in docs for t in q if t in d)
    n = len(docs)
    scores = {}
    for r, d in zip(rows, docs):
        length = sum(d.values()) or 1
        s = 0.0
        for t in q:
            if t in d:
                idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
                s += idf * d[t] * (k1 + 1) / (d[t] + k1 * (1 - b + b * length / avg))
        if s > 0:
            scores[r["id"]] = s
    return scores


def search(user_id: str, query: str, kinds=None, initiative_id: Optional[int] = None,
           date_from: Optional[str] = None, date_to: Optional[str] = None, k: int = 8) -> list:
    """Best `k` chunks for `query` under the filters, best first:
    [{kind, entity_id, title, text, item_date, meta, score}]."""
    kinds = [x for x in (kinds or KINDS) if x in KINDS] or list(KINDS)
    filters = dict(kinds=kinds, initiative_id=initiative_id, date_from=date_from, date_to=date_to)
    rows = db.get_search_chunks(user_id, **filters)
    if not rows:
        return []
    by_id = {r["id"]: r for r in rows}

    rank_lists = []
    q_vec = embeddings.compute_embedding(query, input_type="search_query")
    if q_vec:
        hits = db.match_search_chunks(user_id, q_vec, k=40, **filters)
        rank_lists.append([h["id"] for h in hits if h["id"] in by_id])
    kw = _bm25(query, rows)
    rank_lists.append([i for i, _ in sorted(kw.items(), key=lambda kv: kv[1], reverse=True)[:40]])

    fused: dict = {}
    for ranks in rank_lists:  # reciprocal-rank fusion
        for pos, cid in enumerate(ranks):
            fused[cid] = fused.get(cid, 0.0) + 1.0 / (60 + pos)
    if not fused:
        return []
    candidates = [by_id[c] for c, _ in sorted(fused.items(), key=lambda kv: kv[1], reverse=True)[:25]]

    order = embeddings.rerank(query, [c["text"][:1500] for c in candidates], top_n=min(k, len(candidates)))
    if order:
        picked = [(candidates[i], score) for i, score in order]
    else:
        picked = [(c, fused[c["id"]]) for c in candidates[:k]]
    return [{**c, "score": round(score, 3)} for c, score in picked]
