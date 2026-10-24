"""
google_drive.py — Google Drive as a document source.

The user picks Drive folders to "add to MyConfía"; every supported file in
them (and up to two levels of subfolders) becomes a `document` row with
source='gdrive' - filed by the same AI analysis as an upload (documents.
analyze), searchable from chat, shareable from the Docs tab.

Files are indexed, not copied: only an encrypted thumbnail and the
searchable metadata are stored. Opening/sharing/zipping a Drive document
fetches its bytes live from Drive (download_file), so MyConfía never
holds a second copy of someone's Drive - and a file deleted or moved out
of the folder in Drive drops out of MyConfía on the next sync.

Sync runs in a background thread (start_sync) with progress written to
the drive_folder row, so the UI can show "Syncing 12 of 40". Unchanged
files (same modifiedTime) are skipped, so re-syncs are cheap.
Auth comes from google_oauth.py (the shared Google connection, "drive"
feature = drive.readonly scope).
"""

import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

import db
import documents
import embeddings
import google_oauth
import search_index

API = "https://www.googleapis.com/drive/v3"
FOLDER_MIME = "application/vnd.google-apps.folder"

# Google-native files are exported to PDF (to read, preview and share).
_EXPORTS = {
    "application/vnd.google-apps.document": "application/pdf",
    "application/vnd.google-apps.spreadsheet": "application/pdf",
    "application/vnd.google-apps.presentation": "application/pdf",
    "application/vnd.google-apps.drawing": "image/png",
}
_SUPPORTED_PREFIXES = ("image/",)
_SUPPORTED = {
    "application/pdf", "text/plain", "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
MAX_FILES_PER_FOLDER = 200
MAX_DEPTH = 2
STALE_AFTER = timedelta(hours=6)


def _headers(user_id: str) -> dict:
    return {"Authorization": f"Bearer {google_oauth.get_valid_access_token(user_id, 'drive')}"}


def _get(user_id: str, path: str, params: dict) -> dict:
    resp = requests.get(f"{API}{path}", headers=_headers(user_id), params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def is_supported(mime_type: str) -> bool:
    return mime_type in _EXPORTS or mime_type in _SUPPORTED or mime_type.startswith(_SUPPORTED_PREFIXES)


# ---------------------------------------------------------------- browsing

def list_folders(user_id: str, parent: str = "root", search: Optional[str] = None) -> list:
    """Folders directly inside `parent` - or, with `search`, any folder
    whose name contains it - for the in-app folder picker."""
    if search:
        q = f"mimeType='{FOLDER_MIME}' and trashed=false and name contains '{search.replace(chr(39), '')}'"
    else:
        q = f"'{parent}' in parents and mimeType='{FOLDER_MIME}' and trashed=false"
    body = _get(user_id, "/files", {
        "q": q, "fields": "files(id,name,modifiedTime)", "orderBy": "folder,name", "pageSize": 100,
        "includeItemsFromAllDrives": "true", "supportsAllDrives": "true",
    })
    return [{"id": f["id"], "name": f["name"]} for f in body.get("files", [])]


def folder_name(user_id: str, folder_id: str) -> str:
    if folder_id == "root":
        return "My Drive"
    return _get(user_id, f"/files/{folder_id}", {"fields": "name", "supportsAllDrives": "true"})["name"]


def _list_files(user_id: str, folder_id: str) -> list:
    """Supported files in a folder and its subfolders (breadth-first, up
    to MAX_DEPTH levels, MAX_FILES_PER_FOLDER files)."""
    found, queue = [], [(folder_id, 0)]
    while queue and len(found) < MAX_FILES_PER_FOLDER:
        current, depth = queue.pop(0)
        token = None
        while True:
            params = {
                "q": f"'{current}' in parents and trashed=false",
                "fields": "nextPageToken, files(id,name,mimeType,size,modifiedTime,thumbnailLink)",
                "pageSize": 200, "includeItemsFromAllDrives": "true", "supportsAllDrives": "true",
            }
            if token:
                params["pageToken"] = token
            body = _get(user_id, "/files", params)
            for f in body.get("files", []):
                if f["mimeType"] == FOLDER_MIME:
                    if depth < MAX_DEPTH:
                        queue.append((f["id"], depth + 1))
                elif is_supported(f["mimeType"]) and int(f.get("size") or 0) <= documents.MAX_FILE_BYTES:
                    found.append(f)
            token = body.get("nextPageToken")
            if not token:
                break
    return found[:MAX_FILES_PER_FOLDER]


# ---------------------------------------------------------------- files

def download_file(user_id: str, file_id: str, mime_type: str) -> tuple:
    """(bytes, served_mime_type) - Google Docs/Sheets/Slides come back as PDF."""
    if mime_type in _EXPORTS:
        target = _EXPORTS[mime_type]
        resp = requests.get(f"{API}/files/{file_id}/export", headers=_headers(user_id),
                            params={"mimeType": target}, timeout=60)
    else:
        target = mime_type
        resp = requests.get(f"{API}/files/{file_id}", headers=_headers(user_id),
                            params={"alt": "media", "supportsAllDrives": "true"}, timeout=60)
    resp.raise_for_status()
    return resp.content, target


def fetch(user_id: str, file_id: str) -> tuple:
    """Live download of an already-indexed Drive file (its current type is
    looked up first, so a Google Doc is exported rather than downloaded)."""
    meta = _get(user_id, f"/files/{file_id}", {"fields": "mimeType", "supportsAllDrives": "true"})
    return download_file(user_id, file_id, meta["mimeType"])


def _drive_thumbnail(user_id: str, link: Optional[str]) -> Optional[bytes]:
    if not link:
        return None
    try:
        resp = requests.get(link.split("=s")[0] + "=s480", headers=_headers(user_id), timeout=20)
        if resp.ok and resp.headers.get("content-type", "").startswith("image/"):
            return documents.to_jpeg_thumbnail(resp.content)
    except requests.RequestException:
        pass
    return None


def _file_name(f: dict, served_mime: str) -> str:
    if f["mimeType"] in _EXPORTS and "." not in f["name"][-5:]:
        return f"{f['name']}.{'pdf' if served_mime == 'application/pdf' else 'png'}"
    return f["name"]


# ---------------------------------------------------------------- sync

_running: set = set()
_lock = threading.Lock()


def sync_folder(user_id: str, folder_row_id: int) -> None:
    folder = db.get_drive_folder(user_id, folder_row_id)
    if not folder:
        return
    db.update_drive_folder(user_id, folder_row_id, status="syncing", error=None, synced_files=0)
    try:
        files = _list_files(user_id, folder["folder_id"])
        db.update_drive_folder(user_id, folder_row_id, total_files=len(files))
        existing = {d["drive_file_id"]: d for d in db.get_drive_documents(user_id, folder_row_id)}
        people = db.get_all_people(user_id)
        seen = set()
        for i, f in enumerate(files, 1):
            seen.add(f["id"])
            current = existing.get(f["id"])
            try:
                if current and (current["hidden"] or current.get("drive_modified_time") == f.get("modifiedTime")):
                    continue  # unchanged, or removed from MyConfía by the user
                other = None if current else db.get_document_by_drive_id(user_id, f["id"])
                if other:
                    continue  # already imported through another linked folder
                _import_file(user_id, folder_row_id, f, people, current)
                time.sleep(0.5)  # stay well inside Gemini's free-tier rate limit
            except google_oauth.NotConnectedError:
                raise
            except Exception as e:
                print(f"[warn] drive sync: skipped {f.get('name')}: {e}")
            finally:
                db.update_drive_folder(user_id, folder_row_id, synced_files=i)
        # Files deleted from / moved out of the Drive folder leave MyConfía too.
        gone = [d for fid, d in existing.items() if fid not in seen]
        for d in gone:
            db.delete_document(user_id, d["id"])
        documents.remove_objects([d.get("thumb_path") for d in gone])
        db.update_drive_folder(user_id, folder_row_id, status="ready",
                               last_synced_at=datetime.now(timezone.utc).isoformat())
    except Exception as e:
        print(f"[warn] drive sync failed for folder {folder_row_id}: {e}")
        message = "Google access was removed - reconnect Google in Settings." \
            if isinstance(e, google_oauth.NotConnectedError) else "Couldn't sync this folder - try again."
        db.update_drive_folder(user_id, folder_row_id, status="error", error=message)


def _import_file(user_id: str, folder_row_id: int, f: dict, people: list, current: Optional[dict]) -> None:
    data, served_mime = download_file(user_id, f["id"], f["mimeType"])
    name = _file_name(f, served_mime)
    meta = documents.analyze(data, served_mime, name, people)
    owner, person_id = documents.resolve_owner(meta.get("owner"), meta["category"], people, meta["title"])
    thumb = documents.to_jpeg_thumbnail(data) if served_mime.startswith("image/") else None
    thumb = thumb or _drive_thumbnail(user_id, f.get("thumbnailLink"))
    if current and current.get("thumb_path"):
        documents.remove_objects([current["thumb_path"]])
    row = {
        "title": meta["title"], "description": meta.get("description") or "", "category": meta["category"],
        "tags": meta.get("tags") or [], "owner": owner, "person_id": person_id, "file_name": name,
        "mime_type": served_mime, "size_bytes": len(data), "storage_path": None,
        "thumb_path": documents.store_thumbnail(user_id, thumb) if thumb else None,
        "extracted_text": meta.get("text") or "", "issue_date": meta.get("issue_date"),
        "expiry_date": meta.get("expiry_date"), "source": "gdrive", "drive_file_id": f["id"],
        "drive_folder_id": folder_row_id, "drive_modified_time": f.get("modifiedTime"),
    }
    row["embedding"] = embeddings.compute_embedding(documents.embedding_text(row))
    if current:
        db.update_document(user_id, current["id"], **row)
        search_index.enqueue(user_id, "document", [current["id"]])
    else:
        doc = db.create_document(user_id, **row)
        search_index.enqueue(user_id, "document", [doc["id"]])


def start_sync(user_id: str, folder_row_id: int) -> bool:
    """Runs sync_folder in the background; False if one is already running."""
    key = (user_id, folder_row_id)
    with _lock:
        if key in _running:
            return False
        _running.add(key)

    def run():
        try:
            sync_folder(user_id, folder_row_id)
        finally:
            with _lock:
                _running.discard(key)

    threading.Thread(target=run, daemon=True).start()
    return True


def is_syncing(user_id: str, folder_row_id: int) -> bool:
    return (user_id, folder_row_id) in _running


def sync_stale_folders(user_id: str) -> None:
    """Kicks off a background re-sync for any folder not synced in the
    last few hours - called when the Docs tab loads its folder list."""
    now = datetime.now(timezone.utc)
    for f in db.get_drive_folders(user_id):
        last = f.get("last_synced_at")
        stale = not last or now - datetime.fromisoformat(last) > STALE_AFTER
        if stale and f["status"] != "syncing" and not is_syncing(user_id, f["id"]):
            start_sync(user_id, f["id"])


def remove_folder(user_id: str, folder_row_id: int) -> None:
    thumbs = [d.get("thumb_path") for d in db.get_drive_documents(user_id, folder_row_id)]
    db.delete_drive_folder(user_id, folder_row_id)  # cascades to its documents
    documents.remove_objects(thumbs)
    search_index.enqueue(user_id, "document", [], prune_after=True)


def remove_all(user_id: str) -> None:
    """On disconnecting Google: Drive-backed documents can't be opened any
    more, so their folders and index entries go too."""
    try:
        for f in db.get_drive_folders(user_id):
            remove_folder(user_id, f["id"])
    except Exception as e:
        print(f"[warn] couldn't remove drive folders for {user_id}: {e}")
