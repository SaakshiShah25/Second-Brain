"""
graph.py — The knowledge graph and fact store (schema.sql section 29).

Turns what the app already knows into connected, time-aware structure, with
NO extra LLM calls - everything here is derived deterministically from the
JSON that note extraction (extraction.py) and document filing (documents.py)
already return, and from the person/document rows themselves:

  * organization  - companies as real records. name_key folds case,
                    punctuation and legal suffixes, so "Northwind",
                    "northwind" and "Northwind Pvt Ltd" are ONE company
                    (the old company-briefing split came from plain strings).
  * entity_edge   - who is linked to whom: person works_at organization
                    (valid_from/valid_to keep job history), person
                    family/colleague/friend/related_to person (with the
                    words used, e.g. "Priya's sister"), document belongs_to
                    person/organization.
  * fact          - one attribute value per row with provenance (which note,
                    document or edit it came from) and supersession:
                    single-valued attributes (role, company, phone, email)
                    are never overwritten - the new value supersedes the old
                    one, so history stays answerable ("where was Priya
                    before?"). Multi-valued ones (personal details, traits)
                    accumulate, de-duplicated.

The person table keeps its denormalised role/company/description columns for
the existing screens; facts are the history-preserving record behind them.
Everything here is idempotent, and rebuild_user() reconstructs the whole
graph from source tables.
"""

import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Optional

import db

_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="graph")


def submit(fn, *args) -> None:
    """Runs a graph update off the request path (a capture shouldn't wait
    on it). Failures are logged, never raised - rebuild_user() repairs."""
    def safe():
        try:
            fn(*args)
        except Exception as e:
            print(f"[warn] graph update {fn.__name__} failed: {e}")
    _pool.submit(safe)

SINGLE_VALUED = {"role", "company", "phone", "email"}
_LEGAL_SUFFIX = re.compile(
    r"\b(pvt|private|ltd|limited|llp|llc|inc|incorporated|corp|corporation|co|company|gmbh|plc|sa|ag)\b\.?", re.I)

_FAMILY = re.compile(r"\b(mother|mom|mum|mummy|father|dad|papa|sister|brother|sibling|wife|husband|spouse|partner|"
                     r"fianc[eé]e?|son|daughter|cousin|aunt|uncle|niece|nephew|grand(mother|father|ma|pa)|"
                     r"in-law|family)\b", re.I)
_WORK = re.compile(r"\b(colleague|co-?worker|manager|boss|reports? to|team(mate)?|cto|ceo|cfo|coo|founder|"
                   r"co-?founder|director|vp|head of|lead|engineer|recruiter|client|customer|vendor|partner at|"
                   r"works? (with|at|for))\b", re.I)
_FRIEND = re.compile(r"\b(friend|buddy|classmate|roommate|neighbou?r)\b", re.I)


def org_key(name: str) -> str:
    key = _LEGAL_SUFFIX.sub(" ", (name or "").lower())
    return re.sub(r"[^a-z0-9]+", " ", key).strip()


def relation_type(label: str) -> str:
    if _FAMILY.search(label or ""):
        return "family"
    if _FRIEND.search(label or ""):
        return "friend"
    if _WORK.search(label or ""):
        return "colleague"
    return "related_to"


# ---------------------------------------------------------------- organizations

def ensure_org(user_id: str, name: str) -> Optional[dict]:
    key = org_key(name)
    if not key:
        return None
    return db.upsert_organization(user_id, name.strip(), key)


def find_org(user_id: str, name: str) -> Optional[dict]:
    key = org_key(name)
    return next((o for o in db.get_organizations(user_id) if o["name_key"] == key), None) if key else None


def set_employer(user_id: str, person_id: int, company: str, role: str = "", source=("backfill", None),
                 observed_on: Optional[str] = None) -> None:
    """Current works_at edge for a person; a different company closes the
    previous edge (valid_to) instead of deleting it."""
    org = ensure_org(user_id, company)
    if not org:
        return
    touched = [org["id"]]
    for e in db.get_edges(user_id, "person", person_id, rel="works_at"):
        if e["src_type"] == "person" and e["valid_to"] is None and e["dst_id"] != org["id"]:
            db.update_edge(user_id, e["id"], valid_to=observed_on or date.today().isoformat())
            touched.append(e["dst_id"])
    db.upsert_edge(user_id, src_type="person", src_id=person_id, rel="works_at", dst_type="organization",
                   dst_id=org["id"], label=role or None, source_type=source[0], source_id=source[1],
                   valid_from=observed_on, valid_to=None)
    import search_index  # organization cards list their people - refresh them

    search_index.enqueue(user_id, "organization", touched)


# ---------------------------------------------------------------- facts

def record_fact(user_id: str, entity_type: str, entity_id: int, attribute: str, value: str,
                source=("backfill", None), observed_on: Optional[str] = None,
                existing: Optional[list] = None) -> Optional[dict]:
    """Adds a fact unless it's already known. A single-valued attribute
    supersedes the current value instead of overwriting it."""
    value = (value or "").strip()
    if not value:
        return None
    facts = existing if existing is not None else db.get_facts(user_id, entity_type, entity_id)
    current = [f for f in facts if f["attribute"] == attribute and f["superseded_by"] is None]
    norm = value.lower()
    if any(f["value"].strip().lower() == norm for f in current):
        return None  # already known
    new = db.insert_fact(user_id, entity_type=entity_type, entity_id=entity_id, attribute=attribute, value=value,
                         source_type=source[0], source_id=source[1], observed_on=observed_on)
    if attribute in SINGLE_VALUED:
        for f in current:
            db.update_fact(user_id, f["id"], superseded_by=new["id"], superseded_on=observed_on or date.today().isoformat())
    if existing is not None:
        existing.append(new)
    return new


def person_facts(user_id: str, person_id: int) -> dict:
    """{"current": {attr: [values]}, "history": [{attribute, value, until}]}"""
    current, history = {}, []
    for f in db.get_facts(user_id, "person", person_id):
        if f["superseded_by"] is None:
            current.setdefault(f["attribute"], []).append(f["value"])
        else:
            history.append({"attribute": f["attribute"], "value": f["value"], "since": f.get("observed_on"),
                            "until": f.get("superseded_on")})
    return {"current": current, "history": history}


# ---------------------------------------------------------------- write hooks

def on_capture(user_id: str, interaction_id: int, interaction_date: str, person_id: Optional[int],
               extracted: dict, linked_others: list) -> None:
    """Called after a note is saved (background thread - see capture)."""
    source = ("interaction", interaction_id)
    primary = extracted.get("primary_person") or {}
    if person_id and primary:
        facts = db.get_facts(user_id, "person", person_id)
        for attr in ("role", "company", "phone", "email"):
            record_fact(user_id, "person", person_id, attr, primary.get(attr) or "", source, interaction_date, facts)
        if primary.get("personal_notes"):
            record_fact(user_id, "person", person_id, "personal", primary["personal_notes"], source, interaction_date, facts)
        if primary.get("description"):
            record_fact(user_id, "person", person_id, "trait", primary["description"], source, interaction_date, facts)
        if primary.get("company"):
            set_employer(user_id, person_id, primary["company"], primary.get("role") or "", source, interaction_date)
    for other in linked_others or []:
        label = (other.get("relation") or "").strip()
        if not label:
            continue
        if person_id and other["person_id"] != person_id:
            db.upsert_edge(user_id, src_type="person", src_id=other["person_id"], rel=relation_type(label),
                           dst_type="person", dst_id=person_id, label=label, source_type=source[0],
                           source_id=source[1], valid_from=interaction_date, valid_to=None)
        elif not person_id:
            record_fact(user_id, "person", other["person_id"], "relation_to_me", label, source, interaction_date)


def on_person_edit(user_id: str, person_id: int, fields: dict) -> None:
    """A manual edit on the profile screen is a fact too (source 'manual')."""
    facts = db.get_facts(user_id, "person", person_id)
    for attr in ("role", "company", "phone", "email"):
        if fields.get(attr):
            record_fact(user_id, "person", person_id, attr, fields[attr], ("manual", None), date.today().isoformat(), facts)
    if fields.get("company"):
        set_employer(user_id, person_id, fields["company"], fields.get("role") or "", ("manual", None),
                     date.today().isoformat())


def on_document(user_id: str, doc: dict) -> None:
    """Links a document to whose it is - a person, or a known organization."""
    if doc.get("person_id"):
        db.upsert_edge(user_id, src_type="document", src_id=doc["id"], rel="belongs_to", dst_type="person",
                       dst_id=doc["person_id"], label=None, source_type="document", source_id=doc["id"])
    owner = doc.get("owner")
    if owner and owner != "Me":
        org = find_org(user_id, owner)
        if org:
            db.upsert_edge(user_id, src_type="document", src_id=doc["id"], rel="belongs_to", dst_type="organization",
                           dst_id=org["id"], label=None, source_type="document", source_id=doc["id"])


def forget(user_id: str, entity_type: str, entity_id: int) -> None:
    """Drops an entity's facts and edges (person/document deleted)."""
    db.delete_edges(user_id, [e["id"] for e in db.get_edges(user_id, entity_type, entity_id)])
    db.delete_facts(user_id, [f["id"] for f in db.get_facts(user_id, entity_type, entity_id)])


def repoint(user_id: str, source_person: int, target_person: int) -> None:
    """After a merge: the merged-away person's facts and links move to the target."""
    for f in db.get_facts(user_id, "person", source_person):
        db.update_fact(user_id, f["id"], entity_id=target_person)
    for e in db.get_edges(user_id, "person", source_person):
        fields = {}
        if e["src_type"] == "person" and e["src_id"] == source_person:
            fields["src_id"] = target_person
        if e["dst_type"] == "person" and e["dst_id"] == source_person:
            fields["dst_id"] = target_person
        new_src, new_dst = fields.get("src_id", e["src_id"]), fields.get("dst_id", e["dst_id"])
        if e["src_type"] == e["dst_type"] == "person" and new_src == new_dst:
            db.delete_edges(user_id, [e["id"]])  # would now link the person to themself
            continue
        try:
            db.update_edge(user_id, e["id"], **fields)
        except Exception:
            db.delete_edges(user_id, [e["id"]])  # an identical edge already exists on the target


# ---------------------------------------------------------------- read side

def _name_of(user_id: str, entity_type: str, entity_id: int, people: dict, orgs: dict, docs: dict) -> Optional[str]:
    if entity_type == "person":
        return (people.get(entity_id) or {}).get("name")
    if entity_type == "organization":
        return (orgs.get(entity_id) or {}).get("name")
    if entity_type == "document":
        return (docs.get(entity_id) or {}).get("title")
    return None


def connections(user_id: str, entity_type: str, entity_id: int) -> list:
    """Everything one hop away, as readable rows - plus colleagues (people
    at the same current organization) for a person."""
    people = {p["id"]: p for p in db.get_all_people(user_id)}
    orgs = {o["id"]: o for o in db.get_organizations(user_id)}
    try:
        docs = {d["id"]: d for d in db.get_documents(user_id)}
    except Exception:
        docs = {}
    out = []
    edges = db.get_edges(user_id)
    for e in edges:
        if e["src_type"] == entity_type and e["src_id"] == entity_id:
            other, direction = (e["dst_type"], e["dst_id"]), "out"
        elif e["dst_type"] == entity_type and e["dst_id"] == entity_id:
            other, direction = (e["src_type"], e["src_id"]), "in"
        else:
            continue
        name = _name_of(user_id, other[0], other[1], people, orgs, docs)
        if not name:
            continue  # dangling (deleted entity)
        out.append({"rel": e["rel"], "direction": direction, "type": other[0], "id": other[1], "name": name,
                    "label": e.get("label"), "since": e.get("valid_from"), "until": e.get("valid_to")})
    if entity_type == "person":
        current_orgs = {e["dst_id"] for e in edges if e["rel"] == "works_at" and e["src_type"] == "person"
                        and e["src_id"] == entity_id and e["valid_to"] is None}
        for e in edges:
            if e["rel"] == "works_at" and e["dst_id"] in current_orgs and e["src_id"] != entity_id \
                    and e["valid_to"] is None and e["src_id"] in people:
                out.append({"rel": "colleague", "direction": "same_org", "type": "person", "id": e["src_id"],
                            "name": people[e["src_id"]]["name"], "label": e.get("label"),
                            "at": orgs.get(e["dst_id"], {}).get("name")})
    return out


def organization_profile(user_id: str, org_id: int) -> dict:
    org = next((o for o in db.get_organizations(user_id) if o["id"] == org_id), None)
    if not org:
        return {}
    people = {p["id"]: p for p in db.get_all_people(user_id)}
    current, former, documents = [], [], []
    try:
        docs = {d["id"]: d for d in db.get_documents(user_id)}
    except Exception:
        docs = {}
    for e in db.get_edges(user_id, "organization", org_id):
        if e["rel"] == "works_at" and e["src_id"] in people:
            row = {"person_id": e["src_id"], "name": people[e["src_id"]]["name"], "role": e.get("label"),
                   "since": e.get("valid_from"), "until": e.get("valid_to")}
            (former if e.get("valid_to") else current).append(row)
        elif e["rel"] == "belongs_to" and e["src_type"] == "document" and e["src_id"] in docs:
            documents.append({"document_id": e["src_id"], "title": docs[e["src_id"]]["title"]})
    return {"id": org["id"], "name": org["name"], "people": current, "former_people": former, "documents": documents}


# ---------------------------------------------------------------- rebuild

def rebuild_user(user_id: str) -> dict:
    """(Re)derives the whole graph from source tables - backfill and repair.
    Idempotent: existing facts/edges are recognised, not duplicated."""
    stats = {"organizations": 0, "facts": 0, "edges": 0}
    people = db.get_all_people(user_id)
    for p in people:
        facts = db.get_facts(user_id, "person", p["id"])
        before = len(facts)
        since = p.get("first_met_date")
        for attr in ("role", "company", "phone", "email"):
            record_fact(user_id, "person", p["id"], attr, p.get(attr) or "", ("backfill", None), since, facts)
        for entry in p.get("personal_notes") or []:
            record_fact(user_id, "person", p["id"], "personal", entry.get("note") or "", ("backfill", None),
                        entry.get("date"), facts)
        if p.get("description"):
            record_fact(user_id, "person", p["id"], "trait", p["description"], ("backfill", None), since, facts)
        stats["facts"] += len(facts) - before
        if p.get("company"):
            set_employer(user_id, p["id"], p["company"], p.get("role") or "", ("backfill", None), since)
    # Relationships recorded on notes: extracted_facts.other_people[].relation, linked via interaction_person.
    by_name = {}
    for p in people:
        for n in [p["name"]] + list(p.get("aliases") or []):
            by_name.setdefault(n.strip().lower(), p["id"])
    links = {(l["interaction_id"], l["person_id"]) for l in db.get_interaction_links(user_id)}
    for n in db.get_all_interactions(user_id):
        for other in (n.get("extracted_facts") or {}).get("other_people") or []:
            pid = by_name.get((other.get("name") or "").strip().lower())
            label = (other.get("relation") or "").strip()
            if pid and label and (n["id"], pid) in links:
                if n.get("person_id") and n["person_id"] != pid:
                    db.upsert_edge(user_id, src_type="person", src_id=pid, rel=relation_type(label), dst_type="person",
                                   dst_id=n["person_id"], label=label, source_type="interaction", source_id=n["id"],
                                   valid_from=n.get("date"), valid_to=None)
                elif not n.get("person_id"):
                    record_fact(user_id, "person", pid, "relation_to_me", label, ("interaction", n["id"]), n.get("date"))
    try:
        for d in db.get_documents(user_id):
            on_document(user_id, d)
    except Exception:
        pass  # documents table not migrated
    stats["organizations"] = len(db.get_organizations(user_id))
    stats["edges"] = len(db.get_edges(user_id))
    return stats
