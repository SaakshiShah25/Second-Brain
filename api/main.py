"""
api/main.py — FastAPI entry point for the MyConfía backend
(Phase 1 of the Streamlit -> PWA migration - see the plan/README).

Run with (from repo root, so `import db` etc. resolve the same way
views/*.py already relies on):
    uvicorn api.main:app --reload --port 8000

Swagger UI at http://localhost:8000/docs.
"""

import os
import re
import time

from dotenv import load_dotenv
load_dotenv()

from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError
from pydantic import BaseModel
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

import db
import llm_budget
import moderation
import observability
import voice
from llm_client import get_client as get_llm_client
from api.auth import get_current_user_id
from api.rate_limit import limiter, token_subject
from api.routers import admin, agenda, ask, brief, capture, chat, initiatives, notes, settings, tasks

# Error tracking (Sentry, free Developer plan) - only when SENTRY_DSN is
# set. Notes are private, so nothing personal is sent: no request bodies,
# no headers/cookies/IPs (send_default_pii=False), and local variable
# values are left out of stack traces. Just the error, where it happened,
# and the route.
if os.environ.get("SENTRY_DSN"):
    import sentry_sdk

    sentry_sdk.init(
        dsn=os.environ["SENTRY_DSN"],
        environment=os.environ.get("APP_ENV", "development"),
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        traces_sample_rate=0,
    )

app = FastAPI(title="MyConfía API")

# Rate limiting, keyed by user (the token's subject), falling back to the
# client IP for requests without one - see api/rate_limit.py. This is the
# single Render instance's in-memory store (slowapi's default) - fine at
# current scale, but it resets on redeploy/restart and won't be shared
# across multiple instances if this ever scales horizontally; swap the
# storage_uri to Redis at that point, nothing else here needs to change.
# The Limiter's own generous default (every route not explicitly
# overridden) guards against basic abuse/DoS; the LLM-calling entry
# points (chat.py, capture.py's voice/card endpoints) carry a tighter,
# explicit @limiter.limit(...) since those are what actually cost money
# against Groq/Cohere's shared, rate-limited free-tier quota - including
# the safety check (moderation.py refuses to wave a message through when it
# cannot run), so protecting that quota is itself a safety measure, not
# just a cost one.
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _too_many_requests(request, exc: RateLimitExceeded):
    """Our own per-user request limit (not Groq's) - recorded, so the admin
    page shows who is hitting it and where."""
    route = _route_name(request)
    observability.record("limit", "api_rate_limit", status=429, user_id=token_subject(request),
                         detail={"route": route, "limit": str(exc.detail)})
    return JSONResponse(
        status_code=429,
        content={"detail": "You're sending requests faster than the app allows - wait a minute and try again."},
    )


# A table/column the code expects but the database doesn't have yet
# (schema.sql not applied - see scripts/pending_migration.sql). Turned into
# a clear 503 here because an unhandled exception skips CORSMiddleware's
# headers, which the browser then reports as a bare "Failed to fetch"
# network error - hiding the real, one-step fix.
@app.exception_handler(APIError)
async def _missing_schema_handler(request, exc: APIError):
    area = _area(request.url.path)
    if exc.code in ("PGRST205", "PGRST204", "42703", "42P01"):
        error_id = observability.error(f"database (missing table/column): {area}", exc, status=503)
        return JSONResponse(
            status_code=503,
            content={"detail": f"Part of {area} needs a database update that hasn't been applied yet. "
                               f"We've been alerted (reference {error_id}).", "error_id": error_id},
        )
    error_id = observability.error(f"database: {area}", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"The database had a problem with {area}. We've been alerted (reference {error_id}).",
                 "error_id": error_id},
    )


# ---------- Observability (observability.py) ----------
# Which part of the product a route belongs to, in words a user understands -
# error messages say WHERE something went wrong ("...with saving your note").
_AREAS = [
    ("/api/chat", "processing your message"),
    ("/api/capture", "saving your note"),
    ("/api/ask", "answering your question"),
    ("/api/transcribe", "transcribing your voice note"),
    ("/api/notes", "your notes"),
    ("/api/tasks", "your tasks"),
    ("/api/initiatives", "your initiatives"),
    ("/api/agenda", "your calendar"),
    ("/api/brief", "the morning brief"),
    ("/api/settings", "your settings"),
    ("/api/admin", "the admin page"),
]


def _area(path: str) -> str:
    return next((label for prefix, label in _AREAS if path.startswith(prefix)), "that request")


def _route_name(request) -> str:
    route = request.scope.get("route")
    path = getattr(route, "path", None) or re.sub(r"/\d+", "/{id}", request.url.path)
    return f"{request.method} {path}"


@app.exception_handler(StarletteHTTPException)
async def _http_error(request, exc: StarletteHTTPException):
    """Every deliberate error response. 5xx become a plain-language message
    naming the part that failed plus a reference code, and alert the admin;
    "the AI is busy/at its limit" (429/503) is recorded as a limit, not an
    error - it's expected on free tiers."""
    if exc.status_code in (429, 503) and exc.detail in (llm_budget.BUSY_MESSAGE, moderation.UNAVAILABLE_MESSAGE):
        observability.record("limit", "ai_unavailable", status=exc.status_code, detail={"route": _route_name(request)})
    elif exc.status_code >= 500 and exc.status_code != 503:
        error_id = observability.error(f"{_route_name(request)} ({_area(request.url.path)})", message=str(exc.detail),
                                       status=exc.status_code)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": f"Something went wrong on our side with {_area(request.url.path)}. "
                               f"We've been alerted (reference {error_id}).", "error_id": error_id},
            headers=getattr(exc, "headers", None),
        )
    return await http_exception_handler(request, exc)


@app.middleware("http")
async def _observe(request, call_next):
    """Times every API request and attributes it (and every LLM/Cohere call
    made while serving it) to the signed-in user. A crash nothing else
    caught still answers with a readable message + reference code - and,
    because this runs inside CORSMiddleware, with CORS headers, so the
    browser shows that message instead of "Failed to fetch"."""
    path = request.url.path
    if not path.startswith("/api/") or path == "/api/health" or request.method == "OPTIONS":
        return await call_next(request)
    ctx = observability.set_user(token_subject(request))
    started = time.time()
    try:
        response = await call_next(request)
    except Exception as e:
        error_id = observability.error(f"{_route_name(request)} ({_area(path)})", e)
        response = JSONResponse(
            status_code=500,
            content={"detail": f"Something went wrong on our side with {_area(path)}. "
                               f"We've been alerted (reference {error_id}).", "error_id": error_id},
        )
    observability.record("request", _route_name(request), status=response.status_code,
                         duration_ms=(time.time() - started) * 1000)
    observability.reset_user(ctx)
    return response


app.add_middleware(SlowAPIMiddleware)

# Vite's default dev server port always allowed (local dev), plus the
# next few ports it falls back to when 5173 is already taken by some
# other project on the machine (Vite just picks the next free one rather
# than failing - see the "Port 5173 is in use" line it prints on start).
# The deployed frontend origin is added on top of that via FRONTEND_URL
# so this doesn't need a second, separate env var to configure.
# With APP_ENV=production the localhost ports are dropped: only the real
# frontend (FRONTEND_URL, comma-separated if there are several) may call the API.
_production = os.environ.get("APP_ENV", "").lower() == "production"
_origins = [] if _production else [f"http://localhost:{p}" for p in range(5173, 5178)]
for _url in os.environ.get("FRONTEND_URL", "").split(","):
    _url = _url.strip().rstrip("/")
    if _url and _url not in _origins:
        _origins.append(_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(capture.router, prefix="/api/capture", tags=["capture"])
app.include_router(ask.router, prefix="/api/ask", tags=["ask"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(agenda.router, prefix="/api/agenda", tags=["agenda"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(brief.router, prefix="/api/brief", tags=["brief"])
app.include_router(initiatives.router, prefix="/api/initiatives", tags=["initiatives"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])


@app.get("/api/health")
def health():
    """Liveness for an uptime monitor (e.g. UptimeRobot every 5 minutes).
    It runs a tiny real query, so the regular ping also keeps a free
    Supabase project from pausing after a quiet week, and keeps the free
    Render service from sleeping. Answers 503 when the database is down,
    so the monitor alerts. `groq_tokens_left_today` is the app-wide daily
    AI budget per model (llm_budget.py) - worth watching."""
    supabase_ok = True
    groq_ok = True
    try:
        db.get_client().table("initiative").select("id").limit(1).execute()
    except Exception:
        supabase_ok = False
    try:
        get_llm_client()
    except Exception:
        groq_ok = False
    cohere_ok = bool(os.environ.get("COHERE_API_KEY"))
    budget = {
        model: max(0, llm_budget.DAILY_TOKEN_LIMIT - state.get("used_today", 0))
        for model, state in llm_budget.snapshot().items()
    }
    body = {"supabase": supabase_ok, "groq": groq_ok, "cohere": cohere_ok, "groq_tokens_left_today": budget}
    return body if supabase_ok else JSONResponse(body, status_code=503)


class ClientError(BaseModel):
    message: str
    stack: Optional[str] = None
    path: Optional[str] = None


@app.post("/api/client-error", status_code=204)
@limiter.limit("10/minute")
def client_error(request: Request, body: ClientError, user_id: str = Depends(get_current_user_id)):
    """Crashes in the app itself (frontend/src/lib/errorReporting.ts):
    recorded with the screen it happened on, emailed to the admin, and sent
    to Sentry when that's configured. Only the error text, its stack and the
    screen's path are sent, never note content."""
    message = body.message[:500]
    observability.error(f"app screen {(body.path or '?')[:80]}", message=message, status=0,
                        extra={"source": "frontend", "stack": (body.stack or "")[:1500]})
    if os.environ.get("SENTRY_DSN"):
        import sentry_sdk

        with sentry_sdk.new_scope() as scope:
            scope.set_tag("source", "frontend")
            scope.set_tag("path", (body.path or "")[:200])
            scope.set_extra("stack", (body.stack or "")[:4000])
            sentry_sdk.capture_message(f"[frontend] {message}", level="error")


@app.post("/api/transcribe")
async def transcribe(file: UploadFile, user_id: str = Depends(get_current_user_id)):
    """
    Mode-agnostic voice transcription - unlike POST /api/capture/voice
    (which always runs the full capture pipeline), this just returns the
    transcript so the frontend can feed it into EITHER /api/capture or
    /api/ask depending on which mode the user has selected, mirroring how
    views/chat_view.py's handle_voice_input() routes to handle_capture()
    or handle_retrieval() based on the same `mode` toggle.
    """
    audio_bytes = await file.read()
    try:
        text = voice.transcribe_audio(audio_bytes)
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {e}")
    if not text or not text.strip():
        raise HTTPException(422, "Didn't catch anything in that recording - try again.")
    return {"transcript": text}
