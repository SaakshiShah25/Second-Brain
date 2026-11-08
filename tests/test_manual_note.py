"""POST /api/notes - a note written by hand in a space."""

from fastapi.testclient import TestClient

import db
from api.auth import get_current_user_id
from api.main import app
from api.routers import notes as notes_router


def _client(monkeypatch, saved):
    app.dependency_overrides[get_current_user_id] = lambda: "u1"
    monkeypatch.setattr(db, "get_initiative", lambda u, i: {"id": i} if i == 3 else None)
    monkeypatch.setattr(db, "create_interaction", lambda u, **kw: saved.append(kw) or 9)
    monkeypatch.setattr(notes_router.embeddings, "compute_embedding", lambda t: [0.0])
    monkeypatch.setattr(notes_router.search_index, "enqueue", lambda *a, **k: None)
    return TestClient(app)


def test_note_is_saved_in_the_space(monkeypatch):
    saved = []
    r = _client(monkeypatch, saved).post("/api/notes", json={"raw_text": " Dune is next ", "initiative_id": 3})
    assert r.status_code == 200 and r.json() == {"id": 9}
    assert saved[0]["raw_text"] == "Dune is next" and saved[0]["initiative_id"] == 3
    app.dependency_overrides.clear()


def test_empty_note_or_unknown_space_is_refused(monkeypatch):
    c = _client(monkeypatch, [])
    assert c.post("/api/notes", json={"raw_text": "  "}).status_code == 400
    assert c.post("/api/notes", json={"raw_text": "hi", "initiative_id": 99}).status_code == 404
    app.dependency_overrides.clear()
