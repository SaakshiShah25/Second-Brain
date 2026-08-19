"""
storage.py — Supabase Storage wrapper for original client-agreement files
(see api/routers/clients.py). Separate from db.py's Postgres-only concerns,
but reuses the same Supabase client/credentials (Storage and Postgres are
both part of one Supabase project).

The bucket is PRIVATE (not public) - these are legal documents, not the
kind of thing to hand out via a permanent public URL. Access is always via
a short-lived signed URL generated on demand (get_document_url), after
api/auth.py has already verified the requesting user owns the client
record that document belongs to.
"""

from typing import Optional

import db

BUCKET_NAME = "client-documents"

_bucket_ensured = False


def _bucket():
    return db.get_client().storage.from_(BUCKET_NAME)


def ensure_bucket() -> None:
    """Idempotent - creates the private bucket on first use if it doesn't
    already exist. Cheap enough to call at the top of every upload rather
    than requiring a separate manual setup step."""
    global _bucket_ensured
    if _bucket_ensured:
        return
    try:
        db.get_client().storage.get_bucket(BUCKET_NAME)
    except Exception:
        db.get_client().storage.create_bucket(BUCKET_NAME, options={"public": False})
    _bucket_ensured = True


def _path(user_id: str, client_id, filename: str) -> str:
    # Namespaced by user_id as defense-in-depth (matches every Postgres
    # table's user_id filtering) even though the bucket itself is private
    # and access always goes through get_current_user_id()-gated endpoints.
    return f"{user_id}/{client_id}/{filename}"


def upload_document(user_id: str, client_id, filename: str, file_bytes: bytes, content_type: str) -> str:
    """Uploads the original agreement file, returns the storage path to
    persist on the client row (client.document_path)."""
    ensure_bucket()
    path = _path(user_id, client_id, filename)
    _bucket().upload(path, file_bytes, file_options={"content-type": content_type, "upsert": "true"})
    return path


def get_document_url(path: str, expires_in: int = 3600) -> Optional[str]:
    """Short-lived signed URL for viewing/downloading - None if the path
    is falsy (e.g. a client record created before a document existed)."""
    if not path:
        return None
    result = _bucket().create_signed_url(path, expires_in)
    return result.get("signedURL") or result.get("signedUrl")


def delete_document(path: str) -> None:
    if not path:
        return
    _bucket().remove([path])
