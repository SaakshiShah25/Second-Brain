"""
api/routers/documents.py — Document organizer endpoints (see documents.py
for how storage, AI filing and search work).

File bytes are always streamed back through this API, decrypted, to an
authenticated request - there are no public or signed Storage URLs, so a
leaked link can't expose someone's Aadhaar.
"""

import io
import mimetypes
import re
import zipfile
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

import db
import documents
import embeddings
import google_oauth
import search_index
from api.auth import get_current_user_id
from api.rate_limit import limiter

router = APIRouter()


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    owner: Optional[str] = None
    person_id: Optional[int] = None
    expiry_date: Optional[str] = None   # "" clears it
    tags: Optional[list[str]] = None


class DocumentIds(BaseModel):
    ids: list[int]


class DocumentSearch(BaseModel):
    text: str


def _get_or_404(user_id: str, document_id: int, private: bool = False) -> dict:
    doc = db.get_document(user_id, document_id, include_private=private)
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


def _download_name(doc: dict) -> str:
    """A friendly filename for shares/downloads - the document's title
    plus the original extension ("Aadhaar card.png", not "IMG_4021.png")."""
    ext = (doc.get("file_name") or "").rsplit(".", 1)[-1] if "." in (doc.get("file_name") or "") else ""
    if not ext:
        ext = (mimetypes.guess_extension(doc.get("mime_type") or "") or "").lstrip(".")
    base = re.sub(r'[\\/:*?"<>|]+', "-", doc.get("title") or "document").strip() or "document"
    return f"{base}.{ext}" if ext else base


@router.get("")
def list_documents(user_id: str = Depends(get_current_user_id)):
    return [documents.public_doc(d) for d in db.get_documents(user_id)]


@router.get("/categories")
def list_categories():
    return documents.CATEGORIES


@router.post("")
@limiter.limit("60/minute")
async def upload_document(request: Request, file: UploadFile, user_id: str = Depends(get_current_user_id)):
    """One file per request - the client uploads several in parallel so
    each gets its own progress row and a failure doesn't sink the batch."""
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > documents.MAX_FILE_BYTES:
        raise HTTPException(413, "Files must be 15 MB or smaller")
    mime_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    doc = await run_in_threadpool(documents.create_from_bytes, user_id, data, mime_type, file.filename or "document")
    return documents.public_doc(doc)


@router.post("/search")
@limiter.limit("30/minute")
def search_documents(body: DocumentSearch, request: Request, user_id: str = Depends(get_current_user_id)):
    return documents.search(user_id, body.text)


@router.post("/export")
def export_documents(body: DocumentIds, user_id: str = Depends(get_current_user_id)):
    """Bulk download as one ZIP, with friendly, de-duplicated names."""
    if not body.ids:
        raise HTTPException(400, "No documents selected")
    buf = io.BytesIO()
    used = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for doc_id in body.ids[:50]:
            doc = _get_or_404(user_id, doc_id, private=True)
            name = _download_name(doc)
            stem, dot, ext = name.rpartition(".")
            n = 2
            while name in used:
                name = f"{stem} ({n}).{ext}" if dot else f"{name} ({n})"
                n += 1
            used.add(name)
            z.writestr(name, _bytes(user_id, doc)[0])
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="MyConfia documents {date.today().isoformat()}.zip"'})


@router.get("/{document_id}")
def get_document(document_id: int, user_id: str = Depends(get_current_user_id)):
    return documents.public_doc(_get_or_404(user_id, document_id))


@router.get("/{document_id}/file")
def get_document_file(document_id: int, user_id: str = Depends(get_current_user_id)):
    doc = _get_or_404(user_id, document_id, private=True)
    data, mime_type = _bytes(user_id, doc)
    name = _download_name(doc)
    return Response(data, media_type=mime_type, headers={
        "Content-Disposition": f"inline; filename*=UTF-8''{_quote(name)}",
        "Cache-Control": "private, max-age=300",
        "X-Filename": _quote(name),
        "Access-Control-Expose-Headers": "X-Filename",
    })


@router.get("/{document_id}/thumbnail")
def get_document_thumbnail(document_id: int, user_id: str = Depends(get_current_user_id)):
    doc = _get_or_404(user_id, document_id, private=True)
    if not doc.get("thumb_path"):
        raise HTTPException(404, "No thumbnail")
    return Response(documents.read_object(doc["thumb_path"]), media_type="image/jpeg",
                    headers={"Cache-Control": "private, max-age=3600"})


@router.patch("/{document_id}")
def update_document(document_id: int, body: DocumentUpdate, user_id: str = Depends(get_current_user_id)):
    doc = _get_or_404(user_id, document_id, private=True)
    fields = body.model_dump(exclude_unset=True)
    if "category" in fields and fields["category"] not in documents.CATEGORIES:
        raise HTTPException(400, f"category must be one of {documents.CATEGORIES}")
    if "title" in fields and not (fields["title"] or "").strip():
        raise HTTPException(400, "title can't be empty")
    if "expiry_date" in fields:
        fields["expiry_date"] = fields["expiry_date"] or None
    if not fields:
        return documents.public_doc(doc)
    # Keep search in step with what the user renamed/re-filed it as.
    merged = {**doc, **fields}
    fields["embedding"] = embeddings.compute_embedding(documents.embedding_text(merged))
    updated = db.update_document(user_id, document_id, **fields)
    search_index.enqueue(user_id, "document", [document_id])
    return documents.public_doc(updated)


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: int, user_id: str = Depends(get_current_user_id)):
    doc = _get_or_404(user_id, document_id, private=True)
    if doc.get("source") == "gdrive":
        # Never touches the file in Drive - just hides it from MyConfía,
        # and keeps the row so the next folder sync doesn't re-import it.
        db.update_document(user_id, document_id, hidden=True)
        search_index.enqueue(user_id, "document", [], prune_after=True)
        return
    db.delete_document(user_id, document_id)
    search_index.enqueue(user_id, "document", [], prune_after=True)
    try:
        documents.remove_objects([doc.get("storage_path"), doc.get("thumb_path")])
    except Exception as e:  # row is gone either way; an orphaned blob is ciphertext
        print(f"[warn] couldn't remove storage for document {document_id}: {e}")


def _bytes(user_id: str, doc: dict) -> tuple:
    try:
        return documents.read_document_bytes(user_id, doc)
    except google_oauth.NotConnectedError:
        raise HTTPException(409, "This file lives in Google Drive - reconnect Google in Settings to open it.")


def _quote(name: str) -> str:
    from urllib.parse import quote
    return quote(name)
