# Backend deploy image (Render). The Python-3.9-compatible syntax already
# used throughout this codebase (e.g. Optional[str] instead of str | None -
# see the Phase 1 fixes in retrieval.py/capture.py/api/*) runs fine on
# newer Python too, so this uses a current slim image rather than pinning
# to the older local dev version.
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render injects $PORT at runtime - the app must bind to it, not a
# hardcoded port. Shell form so $PORT expands.
CMD uvicorn api.main:app --host 0.0.0.0 --port $PORT
