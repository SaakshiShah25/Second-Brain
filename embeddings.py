"""
embeddings.py — Shared local embedding logic, used by both capture.py
(to store an embedding on each new interaction) and retrieval.py (to embed
a query for semantic search). Uses sentence-transformers: free, local,
no API calls, runs on CPU.

IMPORTANT: this model produces 384-dimensional vectors, matching the
vector(384) column defined in schema.sql. If you swap embedding models,
update schema.sql's dimension to match (and re-embed existing rows).
"""

_embedder = None
_embedding_available = True


def get_embedder():
    global _embedder, _embedding_available
    if _embedder is None and _embedding_available:
        try:
            from sentence_transformers import SentenceTransformer
            _embedder = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception as e:
            print(f"[warn] Embedding model unavailable ({e}). "
                  f"Continuing without semantic embeddings.")
            _embedding_available = False
    return _embedder


def compute_embedding(text: str):
    """Returns a list[float] (384-dim), or None if the embedding model
    isn't available (e.g. sentence-transformers not installed)."""
    embedder = get_embedder()
    if embedder is None:
        return None
    vector = embedder.encode(text)
    return vector.tolist()
