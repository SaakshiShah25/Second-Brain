"""
api/main.py — FastAPI entry point for the Second Brain backend
(Phase 1 of the Streamlit -> PWA migration - see the plan/README).

Run with (from repo root, so `import db` etc. resolve the same way
views/*.py already relies on):
    uvicorn api.main:app --reload --port 8000

Swagger UI at http://localhost:8000/docs.
"""

import os

from dotenv import load_dotenv
load_dotenv()

from fastapi import Depends, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import db
import voice
from llm_client import get_client as get_llm_client
from api.auth import get_current_user_id
from api.routers import ask, calendar, capture, clients, people, tasks

app = FastAPI(title="Second Brain API")

# Vite's default dev server port always allowed (local dev); the deployed
# frontend origin is added on top of that via FRONTEND_URL (the same env
# var api/routers/calendar.py already uses for the OAuth redirect), so
# this doesn't need a second, separate env var to configure.
_origins = ["http://localhost:5173"]
_frontend_url = os.environ.get("FRONTEND_URL")
if _frontend_url and _frontend_url not in _origins:
    _origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(people.router, prefix="/api/people", tags=["people"])
app.include_router(capture.router, prefix="/api/capture", tags=["capture"])
app.include_router(ask.router, prefix="/api/ask", tags=["ask"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["calendar"])
app.include_router(clients.router, prefix="/api/clients", tags=["clients"])


@app.get("/api/health")
def health():
    """Same connectivity check the Streamlit sidebar badges do."""
    supabase_ok = True
    groq_ok = True
    try:
        db.get_client()
    except Exception:
        supabase_ok = False
    try:
        get_llm_client()
    except Exception:
        groq_ok = False
    cohere_ok = bool(os.environ.get("COHERE_API_KEY"))
    return {"supabase": supabase_ok, "groq": groq_ok, "cohere": cohere_ok}


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
