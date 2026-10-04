"""
timing.py — Step-by-step latency logging for the chat pipeline
(moderation -> intent -> extraction -> person-matching -> embeddings ->
db writes), added after the 2026-10 load test showed capture requests
for longer notes taking ~40s end-to-end with no visibility into which
step actually accounts for it.

Prints to stdout (same place Groq/Gemini's own [warn] lines already go)
rather than wiring up a separate logging/metrics stack - this is a
diagnostic tool for answering "which step is slow", not a permanent
observability platform.
"""

import time
from contextlib import contextmanager


@contextmanager
def step(label: str):
    t0 = time.perf_counter()
    try:
        yield
    finally:
        print(f"[timing] {label}: {time.perf_counter() - t0:.2f}s")
