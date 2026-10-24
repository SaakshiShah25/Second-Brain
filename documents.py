"""
documents.py — The document organizer: drop files in, they organize
themselves, and chat can pull them back out ("pull my aadhaar and photo",
"everything for my Schengen visa").

Pieces:
  * Storage   - file bytes go to a PRIVATE Supabase Storage bucket,
                Fernet-encrypted by the app first (crypto_utils.
                encrypt_bytes), along with a small JPEG thumbnail for
                images. Clients never get a storage URL; the API streams
                decrypted bytes to an authenticated request instead.
  * Analysis  - on upload, Gemini (gemini_client.py's model, which reads
                images and PDFs natively - Groq has no vision model on
                this account, see card_scan.py) suggests a title,
                category, whose document it is, issue/expiry dates, tags
                and a short text digest. Office files (docx/pptx/xlsx)
                are unzipped to plain text first. If Gemini is
                unavailable, a filename-based fallback still files the
                document somewhere sensible - an upload never fails just
                because the AI did.
  * Search    - a request is split into the items it asks for (one LLM
                call, which also expands bundles like "visa documents"),
                then each item is matched against every document by
                embedding similarity plus title/tag keyword and owner
                signals. Personal scale (tens to hundreds of files), so
                this runs in Python over decrypted rows rather than in SQL.

Rows live in the `document` table (schema.sql section 26) via db.py.
"""

import base64
import io
import json
import math
import os
import re
import uuid
import zipfile
from datetime import date
from typing import Optional

import requests

import crypto_utils
import db
import embeddings
import gemini_client
from llm_client import FAST_MODEL_NAME, get_client

BUCKET = "documents"
MAX_FILE_BYTES = 15 * 1024 * 1024

# Fixed category set (the UI has an icon/colour per entry - see
# frontend/src/lib/documentCategories.ts; keep the two in sync). The AI
# must pick from these, so filters stay tidy instead of sprouting
# near-duplicates ("ID", "IDs", "Identity docs").
CATEGORIES = [
    "Identity", "Photos", "Finance", "Tax", "Insurance", "Medical", "Travel", "Education",
    "Home", "Vehicle", "Contracts", "Proposals & Decks", "Invoices", "HR & Hiring",
    "Company & Legal", "Other",
]
# Categories where an unmatched owner most likely means "the user themself".
_PERSONAL_CATEGORIES = {"Identity", "Photos", "Finance", "Tax", "Insurance", "Medical", "Travel",
                        "Education", "Home", "Vehicle"}

_GEMINI_INLINE_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic",
                        "image/heif", "text/plain", "text/csv"}
_OFFICE_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ("word/document.xml",),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ("ppt/slides/",),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ("xl/sharedStrings.xml",),
}


# ---------------------------------------------------------------- storage

def _storage():
    return db.get_client().storage


def ensure_bucket() -> None:
    """Creates the private bucket on first use - idempotent, safe to call
    on every upload (one cheap request)."""
    try:
        _storage().get_bucket(BUCKET)
    except Exception:
        try:
            _storage().create_bucket(BUCKET, options={"public": False})
        except Exception as e:  # created concurrently by another request
            if "already exists" not in str(e).lower() and "duplicate" not in str(e).lower():
                raise


def _put(path: str, data: bytes) -> None:
    _storage().from_(BUCKET).upload(
        path, crypto_utils.encrypt_bytes(data),
        file_options={"content-type": "application/octet-stream", "upsert": "true"},
    )


def read_object(path: str) -> bytes:
    return crypto_utils.decrypt_bytes(_storage().from_(BUCKET).download(path))


def remove_objects(paths: list) -> None:
    paths = [p for p in paths if p]
    if paths:
        _storage().from_(BUCKET).remove(paths)


def purge_user_files(user_id: str) -> None:
    """Deletes every stored file for an account - called on account
    deletion, since Storage objects (unlike table rows) don't cascade from
    auth.users. Best-effort: a storage hiccup must not block deleting the
    account itself."""
    try:
        for folder in _storage().from_(BUCKET).list(user_id, {"limit": 1000}) or []:
            prefix = f"{user_id}/{folder['name']}"
            files = _storage().from_(BUCKET).list(prefix, {"limit": 100}) or []
            remove_objects([f"{prefix}/{f['name']}" for f in files])
    except Exception as e:
        print(f"[warn] purge_user_files({user_id}) failed: {e}")


def _thumbnail(data: bytes, mime_type: str) -> Optional[bytes]:
    if not mime_type.startswith("image/"):
        return None
    return to_jpeg_thumbnail(data)


def to_jpeg_thumbnail(data: bytes) -> Optional[bytes]:
    try:
        from PIL import Image, ImageOps

        img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
        img.thumbnail((480, 480))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        out = io.BytesIO()
        img.save(out, "JPEG", quality=78)
        return out.getvalue()
    except Exception:
        return None  # e.g. HEIC without a decoder - the UI falls back to an icon tile


def store_thumbnail(user_id: str, thumbnail: bytes) -> str:
    """Just a thumbnail - for Drive-backed documents, whose file stays in Drive."""
    ensure_bucket()
    path = f"{user_id}/{uuid.uuid4().hex}/thumb.jpg"
    _put(path, thumbnail)
    return path


def store_file(user_id: str, data: bytes, mime_type: str, thumbnail: Optional[bytes] = None) -> tuple:
    """Uploads the encrypted file (+ thumbnail) and returns
    (storage_path, thumb_path). `thumbnail` lets a caller that already has
    a rendered preview (the demo seeder, for PDFs) supply one."""
    ensure_bucket()
    folder = f"{user_id}/{uuid.uuid4().hex}"
    path = f"{folder}/file"
    _put(path, data)
    thumb = thumbnail or _thumbnail(data, mime_type)
    thumb_path = None
    if thumb:
        thumb_path = f"{folder}/thumb.jpg"
        _put(thumb_path, thumb)
    return path, thumb_path


# ---------------------------------------------------------------- analysis

def _office_text(data: bytes, mime_type: str) -> str:
    """Plain text out of a docx/pptx/xlsx - they're zip files of XML;
    stripping tags is plenty for titling and search."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            prefixes = _OFFICE_TYPES[mime_type]
            names = sorted(n for n in z.namelist() if n.startswith(prefixes) and n.endswith(".xml"))
            xml = " ".join(z.read(n).decode("utf-8", "ignore") for n in names)
        text = re.sub(r"<[^>]+>", " ", xml)
        return re.sub(r"\s+", " ", text).strip()[:20000]
    except Exception:
        return ""


def _analysis_prompt(people: list) -> str:
    known = ", ".join(sorted({p["name"] for p in people})[:60]) or "(none yet)"
    return f"""You file a user's uploaded document into their personal document organizer.
Read the document and return ONLY JSON:
{{
  "title": short, specific, human title - what someone would call it out loud, e.g. "Aadhaar card",
           "Passport", "HDFC bank statement · Jul–Sep 2026", "Acme Logistics MSA", "Salary slip · Sep 2026".
           Add whose it is ONLY if it clearly belongs to someone other than the account holder, e.g.
           "Passport · Dad". Never include ID numbers in the title.
  "category": exactly one of {json.dumps(CATEGORIES)},
  "description": one plain sentence on what it is and what it's useful for (no ID numbers),
  "owner": the person or company this document belongs to / is about, as printed (null if unclear),
  "issue_date": "YYYY-MM-DD" or null,
  "expiry_date": "YYYY-MM-DD" or null - ONLY for things that lapse: ID/licence/passport validity, insurance
                 policy end, contract end, a bill's payment due date, a ticket's travel date. NOT the end of a
                 statement period, a report date or an issue date - use null for those,
  "tags": 3-8 lowercase search keywords INCLUDING common synonyms people use, e.g. for Aadhaar:
          ["aadhaar","aadhar","uid","id proof","address proof","kyc"],
  "text": a plain-text digest of the document's key content (max 1200 characters). Mask any
          government ID / account / card number to its last 4 digits.
}}
People the user already has saved (match spelling if one of them is the owner): {known}."""


def _fallback_analysis(file_name: str) -> dict:
    stem = os.path.splitext(file_name)[0]
    title = re.sub(r"[_\-]+", " ", stem).strip().title() or "Untitled document"
    lower = stem.lower()
    category = "Other"
    for cat, words in {
        "Identity": ["aadhaar", "aadhar", "pan", "passport", "licence", "license", "voter", "id"],
        "Photos": ["photo", "pic", "selfie", "img"],
        "Finance": ["statement", "bank", "salary", "payslip"],
        "Tax": ["itr", "tax", "form16", "gst"],
        "Invoices": ["invoice", "bill", "receipt"],
        "Contracts": ["contract", "agreement", "nda", "msa", "sow"],
        "Proposals & Decks": ["deck", "proposal", "pitch", "presentation"],
        "Insurance": ["insurance", "policy"],
        "Medical": ["report", "prescription", "vaccin", "lab"],
        "Travel": ["ticket", "flight", "booking", "visa", "itinerary"],
    }.items():
        if any(w in lower for w in words):
            category = cat
            break
    return {"title": title, "category": category, "description": "", "owner": None, "issue_date": None,
            "expiry_date": None, "tags": [w for w in re.split(r"\W+", lower) if len(w) > 2][:6], "text": ""}


def _valid_date(value) -> Optional[str]:
    try:
        return date.fromisoformat(str(value)[:10]).isoformat() if value else None
    except ValueError:
        return None


def analyze(data: bytes, mime_type: str, file_name: str, people: list) -> dict:
    """Suggested metadata for a freshly uploaded file - always returns a
    usable dict (falls back to the filename heuristics above)."""
    fallback = _fallback_analysis(file_name)
    if not gemini_client.available():
        return fallback
    parts = []
    if mime_type in _OFFICE_TYPES:
        text = _office_text(data, mime_type)
        if not text:
            return fallback
        parts.append({"text": f"File name: {file_name}\n\nDocument text:\n{text}"})
    elif mime_type in _GEMINI_INLINE_TYPES:
        parts.append({"inline_data": {"mime_type": mime_type, "data": base64.b64encode(data).decode()}})
        parts.append({"text": f"File name: {file_name}"})
    else:
        parts.append({"text": f"File name: {file_name} (contents not readable - infer from the name)"})
    try:
        resp = requests.post(
            gemini_client.GEMINI_URL,
            params={"key": os.environ.get("GEMINI_API_KEY")},
            json={
                "system_instruction": {"parts": [{"text": _analysis_prompt(people)}]},
                "contents": [{"role": "user", "parts": parts}],
                "generationConfig": {"temperature": 0.1, "response_mime_type": "application/json"},
            },
            timeout=60,
        )
        resp.raise_for_status()
        out = json.loads(resp.json()["candidates"][0]["content"]["parts"][0]["text"])
    except Exception as e:
        print(f"[warn] document analysis failed, using filename fallback: {e}")
        return fallback
    category = out.get("category") if out.get("category") in CATEGORIES else fallback["category"]
    tags = [str(t).lower().strip() for t in (out.get("tags") or []) if str(t).strip()][:8]
    return {
        "title": (out.get("title") or fallback["title"]).strip()[:120],
        "category": category,
        "description": (out.get("description") or "").strip()[:400],
        "owner": (out.get("owner") or None),
        "issue_date": _valid_date(out.get("issue_date")),
        "expiry_date": _valid_date(out.get("expiry_date")),
        "tags": tags,
        "text": (out.get("text") or "").strip()[:1500],
    }


def _match_person(name: str, people: list):
    key = name.strip().lower()
    for p in people:
        if any(n and n.lower() == key for n in [p["name"]] + list(p.get("aliases") or [])):
            return p
    return None


def resolve_owner(owner: Optional[str], category: str, people: list, title: str = "") -> tuple:
    """(owner_label, person_id): links the owner to a saved person (by
    name, alias or - for work documents - company) when there's a match.

    The title's "· Whose" suffix wins over the printed owner name: the
    printed name on Mum's Aadhaar is her legal name ("Sunita Shah"),
    which won't match a contact saved as "Mum" - but the AI is told to
    title it "Aadhaar card · Mum" when it's clearly someone else's.
    An unmatched owner on a personal-type document is almost always the
    account holder themself, so it's labelled "Me"."""
    suffix = title.rsplit(" · ", 1)[1].strip() if " · " in title else ""
    if suffix and not re.search(r"\d", suffix):
        p = _match_person(suffix, people)
        if p:
            return p["name"], p["id"]
        if category in _PERSONAL_CATEGORIES and len(suffix.split()) <= 3:
            return suffix, None  # e.g. "Dad" with no contact saved yet
    if owner:
        key = owner.strip().lower()
        for p in people:
            names = [p["name"]] + list(p.get("aliases") or [])
            if any(n and (n.lower() == key or n.lower() in key.split(" · ")) for n in names):
                return p["name"], p["id"]
        for p in people:
            if p.get("company") and p["company"].strip().lower() == key:
                return p["company"], p["id"]
    if category in _PERSONAL_CATEGORIES:
        return "Me", None
    return (owner.strip() if owner else None), None


def embedding_text(doc: dict) -> str:
    tags = ", ".join(doc.get("tags") or [])
    return (f"{doc.get('title', '')}. Category: {doc.get('category', '')}. Owner: {doc.get('owner') or ''}. "
            f"{doc.get('description') or ''} Tags: {tags}. {doc.get('extracted_text') or ''}")[:3000]


def create_from_bytes(user_id: str, data: bytes, mime_type: str, file_name: str,
                      overrides: Optional[dict] = None, thumbnail: Optional[bytes] = None) -> dict:
    """The whole upload pipeline - store, analyze, link owner, embed,
    insert. `overrides` (title/category/...) replace the AI's suggestions;
    the demo seeder uses it to skip analysis entirely."""
    people = db.get_all_people(user_id)
    meta = dict(overrides) if overrides and overrides.get("title") else analyze(data, mime_type, file_name, people)
    owner, person_id = (meta.get("owner"), meta.get("person_id")) if "person_id" in meta else \
        resolve_owner(meta.get("owner"), meta.get("category", "Other"), people, meta.get("title", ""))
    storage_path, thumb_path = store_file(user_id, data, mime_type, thumbnail)
    row = {
        "title": meta["title"], "description": meta.get("description") or "", "category": meta.get("category", "Other"),
        "tags": meta.get("tags") or [], "owner": owner, "person_id": person_id, "file_name": file_name,
        "mime_type": mime_type, "size_bytes": len(data), "storage_path": storage_path, "thumb_path": thumb_path,
        "extracted_text": meta.get("text") or "", "issue_date": meta.get("issue_date"),
        "expiry_date": meta.get("expiry_date"), "source": "upload",
    }
    row["embedding"] = embeddings.compute_embedding(embedding_text(row))
    doc = db.create_document(user_id, **row)
    import search_index  # local: search_index reads documents via db, no cycle at import time

    search_index.enqueue(user_id, "document", [doc["id"]])
    return doc


# ---------------------------------------------------------------- search

_PARSE_PROMPT = f"""A user asks their personal document organizer to fetch documents. Split the request
into the individual documents they need. Expand well-known bundles into their usual parts, e.g.
"visa documents" -> passport, passport-size photo, recent bank statements, salary slips, income tax
return, travel insurance, flight booking, hotel booking; "KYC" -> identity proof (Aadhaar/PAN),
address proof, photo; "rental documents" -> ID proof, salary slips, rent agreement.
Expand ONLY when they ask for documents FOR a purpose or process. A request that names specific
documents ("car insurance", "PAN card", "the Acme contract") means exactly those - one item each,
never the paperwork related to them. "Last two salary slips" = two "Salary slip" items.
Return ONLY JSON: {{"items": [{{"label": short display name e.g. "Aadhaar card",
"search": keywords incl. synonyms, "owner": whose document if stated ("Mum", "Dad", a person or
company name) else null, "category": best guess from {json.dumps(CATEGORIES)} or null}}]}}
Max 10 items. If the request names no specific documents (e.g. "show my documents"), return items: []."""


def _parse_request(text: str) -> list:
    try:
        resp = get_client().chat.completions.create(
            model=FAST_MODEL_NAME,
            messages=[{"role": "system", "content": _PARSE_PROMPT}, {"role": "user", "content": text}],
            temperature=0, response_format={"type": "json_object"},
        )
        items = json.loads(resp.choices[0].message.content).get("items") or []
        return [i for i in items if isinstance(i, dict) and i.get("label")][:10]
    except Exception as e:
        print(f"[warn] document request parsing failed: {e}")
        return [{"label": text.strip()[:60], "search": text, "owner": None, "category": None}]


def _vec(value) -> Optional[list]:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return None
    return value


def _cosine(a: list, b: list) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


_STOP = {
    "my", "the", "a", "an", "of", "and", "for", "copy", "document", "documents", "card", "file", "me", "pull", "get",
    "send", "our", "his", "her", "their", "with", "from",
    # qualifiers - "recent bank statements" must not require the word "recent"
    "recent", "latest", "last", "new", "old", "current", "previous", "scan", "scanned", "soft", "original",
    # dates inside titles ("Salary slip · Sep 2026") say nothing about WHAT it is
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "fy",
}


def _stem(t: str) -> str:
    """Just enough to make plurals meet singulars (slips -> slip)."""
    return t[:-1] if len(t) > 4 and t.endswith("s") and not t.endswith("ss") else t


def _tokens(s: str) -> set:
    return {_stem(t) for t in re.split(r"[^a-z0-9]+", (s or "").lower()) if len(t) > 1 and t not in _STOP}


def _title_words(s: str) -> set:
    """Title tokens minus codes/numbers ("INV-2026-031", "MH02", "2026") -
    they shouldn't make a title look less about what was asked for."""
    return {t for t in _tokens(s) if t.isalpha() and len(t) >= 3}


_MIN_SCORE = 0.35   # worth showing as an option at all
_BEST_SCORE = 0.62  # confident enough to pre-tick


def _score(item: dict, d: dict, q_vec) -> tuple:
    """(score, coverage) for one requested item against one document.

    coverage  - share of the words the user asked for ("aadhaar card")
                found in the document's title/tags/category.
    title_fit - share of the document's OWN title words that are about the
                request (synonyms included), so "Passport" fits a
                "Passport" title fully but a "Passport-size photo" only a
                third - the case a plain keyword overlap gets wrong.
    Embedding similarity carries the semantics on top ("ITR" ~ "income
    tax return"); category and owner nudge the order.
    """
    label = _tokens(item["label"])
    asked = label | _tokens(item.get("search") or "")
    coverage = len(label & d["_all"]) / len(label) if label else 0.0
    title_fit = len(d["_title"] & asked) / len(d["_title"]) if d["_title"] else 0.0
    cosine = _cosine(q_vec, d["_vec"]) if q_vec and d["_vec"] else 0.0
    score = 0.6 * cosine + 0.35 * coverage + 0.25 * title_fit
    if item.get("category"):
        score += 0.05 if item["category"] == d.get("category") else -0.05
    want_owner = (item.get("owner") or "").strip().lower()
    if want_owner and want_owner not in ("me", "my", "mine", "self"):
        score += 0.2 if want_owner in d["_owner"] else -0.15
    elif d["_owner"] not in ("me", ""):
        score -= 0.06  # "my X" means the user's own copy, not Mum's
    return score, coverage


def public_doc(doc: dict) -> dict:
    """What the client sees - never storage paths, text digest or vectors."""
    return {k: doc.get(k) for k in (
        "id", "title", "description", "category", "tags", "owner", "person_id", "initiative_id", "file_name",
        "mime_type", "size_bytes", "issue_date", "expiry_date", "source", "created_at", "drive_folder_id")} | {
        "has_thumbnail": bool(doc.get("thumb_path")),
        "drive_url": f"https://drive.google.com/file/d/{doc['drive_file_id']}/view" if doc.get("drive_file_id") else None}


def search(user_id: str, text: str) -> dict:
    """{"groups": [{"label", "matches": [doc + score], "best": id|None}]}
    - one group per requested item, best match first."""
    docs = db.get_documents_for_search(user_id)
    if not docs:
        return {"groups": [], "total_documents": 0}
    items = _parse_request(text)
    if not items:  # "show my documents" - just the most recent ones
        return {"groups": [{"label": "Your documents", "matches": [public_doc(d) | {"score": 0}
                for d in docs[:8]], "best": None}], "total_documents": len(docs)}

    for d in docs:
        d["_vec"] = _vec(d.get("embedding"))
        d["_title"] = _title_words(d.get("title"))
        d["_all"] = d["_title"] | _tokens(f"{' '.join(d.get('tags') or [])} {d.get('category')}")
        d["_owner"] = (d.get("owner") or "").lower()

    groups = []
    chosen: set = set()  # "my last two salary slips" -> two items, two DIFFERENT slips
    for item in items:
        q_vec = embeddings.compute_embedding(f"{item['label']}. {item.get('search') or ''}", input_type="search_query")
        scored = sorted(((_score(item, d, q_vec), d) for d in docs), key=lambda t: t[0][0], reverse=True)
        top = [(sc, d) for sc, d in scored[:5] if sc[0] >= _MIN_SCORE]
        # Pre-tick only a confident match: it scores well AND actually
        # covers what was asked for - "Passport" must not pre-tick a
        # "Passport-size photo", and "travel insurance" with none on file
        # must come back as not-found rather than the nearest lookalike.
        best = None
        for (score, coverage), doc in top:
            if doc["id"] in chosen:
                continue
            if score >= _BEST_SCORE and coverage >= 0.5:
                best = doc["id"]
                chosen.add(best)
            break
        groups.append({
            "label": item["label"],
            "matches": [public_doc(d) | {"score": round(sc[0], 3)} for sc, d in top],
            "best": best,
        })
    return {"groups": groups, "total_documents": len(docs)}


def read_document_bytes(user_id: str, doc: dict) -> tuple:
    """(bytes, mime_type) for any document - decrypted from our storage for
    uploads, fetched live from Drive for Drive-backed ones."""
    if doc.get("source") == "gdrive" and doc.get("drive_file_id"):
        import google_drive  # local import: google_drive imports this module

        return google_drive.fetch(user_id, doc["drive_file_id"])
    return read_object(doc["storage_path"]), doc["mime_type"]
