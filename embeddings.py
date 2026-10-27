"""
embeddings.py — Shared embedding logic, used by both capture.py (to store
an embedding on each new interaction) and retrieval.py (to embed a query
for semantic search).

Calls Cohere's hosted embed API rather than running a model locally.
Previously used sentence-transformers (a local model, no API calls) - that
was switched away from because loading it (plus PyTorch's own overhead)
routinely exceeded Render's free-tier 512MB RAM limit and OOM-crashed the
backend mid-request, every time an embedding was computed (confirmed live
in production). A hosted API call has no local memory footprint - the
tradeoff is a network round-trip per call and a dependency on Cohere's
uptime/free-tier limits instead.

Get a free API key (no credit card required) at: https://cohere.com
Then set it as an environment variable:
    export COHERE_API_KEY="your_key_here"

IMPORTANT: this model produces 1024-dimensional vectors, matching the
vector(1024) column defined in schema.sql (see section 17 - the
migration away from the old 384-dim local model). If you swap embedding
models/providers again, update schema.sql's dimension to match (and
re-embed existing rows, since a different model's vectors aren't
comparable to the old ones).
"""

import os
import time

import requests

EMBED_URL = "https://api.cohere.com/v2/embed"
MODEL_NAME = "embed-english-v3.0"


_query_cache: dict = {}
_rerank_day = {"day": None, "count": 0}


def compute_embedding(text: str, input_type: str = "search_document"):
    """Cached for search queries - a trial Cohere key allows only 1,000 calls
    a month, and the agent often searches the same phrasing more than once."""
    if input_type == "search_query":
        key = text.strip().lower()
        if key in _query_cache:
            return _query_cache[key]
        vec = _compute_embedding(text, input_type)
        if vec is not None:
            if len(_query_cache) > 500:
                _query_cache.clear()
            _query_cache[key] = vec
        return vec
    return _compute_embedding(text, input_type)


def _track(name: str, resp=None, exc=None, started=None, count=1) -> None:
    """Records a Cohere call (observability.py): ok, a 429 (trial key
    limits), or another failure - the latter two show on the admin page."""
    import observability

    ms = (time.time() - started) * 1000 if started else None
    status = getattr(getattr(exc, "response", None), "status_code", None) if exc is not None else getattr(resp, "status_code", 200)
    if exc is None:
        observability.record("cohere", name, status=status, duration_ms=ms, detail={"texts": count})
    elif status == 429:
        observability.record("limit", "cohere_rate_limit", status=429, detail={"call": name})
        observability.alert("cohere429", "Cohere limit hit",
                            f"Cohere refused a {name} call with 429 (trial key: 1,000 calls/month, "
                            "rerank 10/min). Search falls back to keyword-only until it recovers.")
    else:
        observability.record("cohere", name, status=status or 0, duration_ms=ms,
                             detail={"error": type(exc).__name__})


def _compute_embedding(text: str, input_type: str = "search_document"):
    """Returns a list[float] (1024-dim), or None if the embedding API
    isn't reachable/configured (e.g. COHERE_API_KEY not set, or a
    transient API error) - callers already handle None gracefully (a
    capture/search still proceeds, just without semantic search for that
    row/query, same graceful-degradation contract the old local-model
    version had for "model failed to load").

    `input_type` follows Cohere's own distinction between embedding text
    that will be SEARCHED OVER later ("search_document" - the default,
    used when storing a new interaction) vs text that IS a search query
    right now ("search_query" - used by retrieval.py). Using the matching
    type for each side measurably improves retrieval quality; passing the
    wrong one still works, just less accurately.
    """
    api_key = os.environ.get("COHERE_API_KEY")
    if not api_key:
        print("[warn] COHERE_API_KEY not set. Continuing without semantic embeddings.")
        return None

    started = time.time()
    try:
        resp = requests.post(
            EMBED_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": MODEL_NAME,
                "texts": [text],
                "input_type": input_type,
                "embedding_types": ["float"],
            },
            timeout=15,
        )
        resp.raise_for_status()
        _track("embed", resp, started=started)
        return resp.json()["embeddings"]["float"][0]
    except Exception as e:
        _track("embed", exc=e, started=started)
        print(f"[warn] Embedding request failed ({e}). Continuing without semantic embeddings.")
        return None


RERANK_URL = "https://api.cohere.com/v2/rerank"
RERANK_MODEL = "rerank-v3.5"


def compute_embeddings(texts: list, input_type: str = "search_document") -> list:
    """Batched compute_embedding() - Cohere takes up to 96 texts per call,
    so re-indexing a whole account (search_index.reindex_user) costs a
    handful of requests rather than one per note. Returns a list aligned
    with `texts`; entries are None where embedding failed."""
    api_key = os.environ.get("COHERE_API_KEY")
    out = [None] * len(texts)
    if not api_key:
        return out
    for start in range(0, len(texts), 96):
        batch = texts[start:start + 96]
        started = time.time()
        try:
            resp = requests.post(
                EMBED_URL,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": MODEL_NAME, "texts": batch, "input_type": input_type, "embedding_types": ["float"]},
                timeout=60,
            )
            resp.raise_for_status()
            _track("embed_batch", resp, started=started, count=len(batch))
            out[start:start + len(batch)] = resp.json()["embeddings"]["float"]
        except Exception as e:
            _track("embed_batch", exc=e, started=started, count=len(batch))
            print(f"[warn] Batch embedding failed ({e}); those chunks will be keyword-searchable only.")
    return out


def rerank(query: str, documents: list, top_n: int) -> list:
    """Cohere's cross-encoder reranker: [(index, relevance 0-1), ...] best
    first, or [] if unavailable (callers keep their own order then).
    Much better than embedding distance at "which of these 20 candidates
    actually answers the question" - search_index.search() uses it as the
    final ordering step over hybrid (vector + keyword) candidates."""
    api_key = os.environ.get("COHERE_API_KEY")
    if not api_key or len(documents) <= 3:
        return []  # nothing to gain from reordering three or fewer candidates
    from datetime import date

    today = date.today().isoformat()
    if _rerank_day["day"] != today:
        _rerank_day.update(day=today, count=0)
    if _rerank_day["count"] >= int(os.environ.get("COHERE_RERANK_DAILY_CAP", "25")):
        import observability

        observability.record("limit", "cohere_rerank_daily_cap", detail={"cap": _rerank_day["count"]})
        return []  # daily cap reached (trial keys: 1,000 calls/month) - hybrid order is used instead
    _rerank_day["count"] += 1
    started = time.time()
    try:
        resp = requests.post(
            RERANK_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": RERANK_MODEL, "query": query, "documents": documents, "top_n": top_n},
            timeout=15,
        )
        resp.raise_for_status()
        _track("rerank", resp, started=started, count=len(documents))
        return [(r["index"], r["relevance_score"]) for r in resp.json()["results"]]
    except Exception as e:
        _track("rerank", exc=e, started=started, count=len(documents))
        print(f"[warn] Rerank failed ({e}); using hybrid order.")
        return []
