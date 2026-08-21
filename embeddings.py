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

import requests

EMBED_URL = "https://api.cohere.com/v2/embed"
MODEL_NAME = "embed-english-v3.0"


def compute_embedding(text: str, input_type: str = "search_document"):
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
        return resp.json()["embeddings"]["float"][0]
    except Exception as e:
        print(f"[warn] Embedding request failed ({e}). Continuing without semantic embeddings.")
        return None
