"""
graph.py - The knowledge graph and the memory layer (schema.sql sections 29
and 31).

Turns what the app already knows into connected, time-aware structure, with
NO extra LLM calls - everything here is derived deterministically from the
JSON that note extraction (extraction.py) and document filing (documents.py)
already return, cleaned by memory_schema.py, and from the person/document
rows themselves:

  * organization  - companies as real records. name_key folds case,
                    punctuation and legal suffixes, so "Northwind",
                    "northwind" and "Northwind Pvt Ltd" are ONE company.
  * relationship  - who is linked to whom: person works_at organization
                    (valid_from/valid_to keep job history), person
                    family/colleague/friend/related_to person (rel_type says
                    spouse / parent / child / sibling / ..., label keeps the
                    words used, e.g. "Priya's sister"), document belongs_to
                    person/organization.
  * person_fact   - one attribute value per row (likes, hobby, diet,
                    lives_in, role, ...) about the person or a relative, with
                    provenance (which note, document or edit it came from)
                    and supersession: single-valued attributes are never
                    overwritten - the new value supersedes the old one, so
                    history stays answerable ("where did Priya live before?").
                    Multi-valued ones (likes, hobbies) accumulate, de-duplicated.
  * key_date      - recurring dates: birthdays, anniversaries, custom ones.

The person table keeps its denormalised role/company/description columns for
the existing screens; these tables are the history-preserving, queryable
record behind them. Everything here is idempotent, and rebuild_user()
reconstructs the whole graph from source tables.
"""

import calendar
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Optional

import crypto_utils
import db
import memory_schema

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

_LEGAL_SUFFIX = re.compile(
    r"\b(pvt|private|ltd|limited|llp|llc|inc|incorporated|corp|corporation|co|company|gmbh|plc|sa|ag)\b\.?", re.I)


def org_key(name: str) -> str:
    key = _LEGAL_SUFFIX.sub(" ", (name or "").lower())
    return re.sub(r"[^a-z0-9]+", " ", key).strip()


def relation_type(label: str) -> str:
    """The coarse group stored in relationship.rel: family | friend |
    colleague | related_to. (The finer rel_type - spouse, parent, ... - comes
    from memory_schema.rel_type_of.)"""
    return memory_schema.rel_group_of(label)


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
    for e in db.get_relationships(user_id, "person", person_id, rel="works_at"):
        if e["src_type"] == "person" and e["valid_to"] is None and e["dst_id"] != org["id"]:
            db.update_relationship(user_id, e["id"], valid_to=observed_on or date.today().isoformat())
            touched.append(e["dst_id"])
    db.upsert_relationship(user_id, src_type="person", src_id=person_id, rel="works_at", dst_type="organization",
                   dst_id=org["id"], label=role or None, source_type=source[0], source_id=source[1],
                   valid_from=observed_on, valid_to=None)
    import search_index  # organization cards list their people - refresh them

    search_index.enqueue(user_id, "organization", touched)




# ---------------------------------------------------------------- person_fact

def _same_subject(f: dict, subject: str, subject_name: Optional[str]) -> bool:
    return (f.get("subject") or "self") == subject and \
        (f.get("subject_name") or "").strip().lower() == (subject_name or "").strip().lower()


def record_fact(user_id: str, person_id: int, attribute: str, value: str,
                source=("backfill", None), observed_on: Optional[str] = None,
                existing: Optional[list] = None, subject: str = "self", subject_name: Optional[str] = None,
                confidence: str = "stated") -> Optional[dict]:
    """Stores one fact about a person unless it's already known.

    * Same attribute + subject + value already current  -> nothing added
      (a 'likely' fact that is now stated is upgraded in place).
    * A single-valued attribute (lives_in, company, diet, ...) with a NEW
      value supersedes the current one instead of overwriting it, so
      "where did she live before?" stays answerable.
    * Multi-valued attributes (likes, hobby, ...) just accumulate.
    A manual entry is never superseded by a value read from a note."""
    clean = memory_schema.clean_fact({"attribute": attribute, "value": value, "subject": subject,
                                      "subject_name": subject_name, "confidence": confidence})
    if not clean:
        return None
    facts = existing if existing is not None else db.get_person_facts(user_id, person_id)
    current = [f for f in facts if f["attribute"] == clean["attribute"] and f["superseded_by"] is None
               and _same_subject(f, clean["subject"], clean["subject_name"])]
    norm = memory_schema.value_norm(clean["value"])
    for f in current:
        if memory_schema.value_norm(f["value"]) == norm:
            if f.get("confidence") == "likely" and clean["confidence"] == "stated":
                db.update_person_fact(user_id, f["id"], confidence="stated")
                f["confidence"] = "stated"
            return None  # already known
    single = memory_schema.is_single_valued(clean["attribute"])
    if single and source[0] != "manual" and any(f.get("source_type") == "manual" for f in current):
        return None  # something the user typed in themselves wins over a note
    new = db.insert_person_fact(
        user_id, person_id=person_id, attribute=clean["attribute"], value=clean["value"],
        value_norm=clean["value_norm"], subject=clean["subject"], subject_name=clean["subject_name"],
        confidence=clean["confidence"], is_sensitive=clean["is_sensitive"],
        source_type=source[0], source_id=source[1], observed_on=observed_on)
    if single:
        for f in current:
            db.update_person_fact(user_id, f["id"], superseded_by=new["id"],
                                  valid_to=observed_on or date.today().isoformat())
            f["superseded_by"] = new["id"]
    if existing is not None:
        existing.append(new)
    return new


def repair_moves(user_id: str, person_id: int) -> int:
    """Turns earlier 'life event: moved to X' rows into 'lives in: X' and puts
    all of a person's places into one timeline (oldest first; each one's end
    date is the next one's start). Returns how many places it added. Safe to
    repeat."""
    facts = [f for f in db.get_person_facts(user_id, person_id) if (f.get("subject") or "self") == "self"]
    places, added = [], 0
    for f in facts:
        if f["attribute"] == "lives_in":
            places.append({"fact": f, "key": (f.get("observed_on") or "", f["id"])})
        elif f["attribute"] == "life_event" and memory_schema.move_destination(f["value"]):
            place = memory_schema.move_destination(f["value"])
            new = db.insert_person_fact(
                user_id, person_id=person_id, attribute="lives_in", value=place, value_norm=memory_schema.value_norm(place),
                subject="self", confidence=f.get("confidence") or "stated", is_sensitive=False,
                source_type=f.get("source_type"), source_id=f.get("source_id"), observed_on=f.get("observed_on"))
            db.delete_person_facts(user_id, [f["id"]])
            places.append({"fact": new, "key": (f.get("observed_on") or "", f["id"])})
            added += 1
    places.sort(key=lambda p: p["key"])
    chain = []
    for item in places:  # the same place twice in a row is one stay
        if chain and memory_schema.value_norm(chain[-1]["fact"]["value"]) == memory_schema.value_norm(item["fact"]["value"]):
            db.delete_person_facts(user_id, [item["fact"]["id"]])
            continue
        chain.append(item)
    for i, item in enumerate(chain):
        nxt = chain[i + 1]["fact"] if i + 1 < len(chain) else None
        wanted = ({"superseded_by": nxt["id"], "valid_to": nxt.get("observed_on") or date.today().isoformat()}
                  if nxt else {"superseded_by": None, "valid_to": None})
        if (item["fact"].get("superseded_by"), item["fact"].get("valid_to")) != (wanted["superseded_by"], wanted["valid_to"]):
            db.update_person_fact(user_id, item["fact"]["id"], **wanted)
    return added


def remove_fact(user_id: str, fact_id: int) -> None:
    db.delete_person_facts(user_id, [fact_id])


# ---------------------------------------------------------------- key_date

def _same_date(kd: dict, item: dict) -> bool:
    a, b = (kd.get("subject_name") or "").strip().lower(), (item.get("subject_name") or "").strip().lower()
    # An anniversary stored before the spouse was known ("their anniversary") is the
    # same one as the same date naming them.
    same_who = a == b or (item["date_type"] == "anniversary" and (not a or not b))
    return (kd["date_type"] == item["date_type"] and (kd.get("subject") or "self") == item["subject"] and same_who
            and (item["date_type"] != "custom" or (kd.get("label") or "").lower() == item["label"].lower()))


def record_key_date(user_id: str, person_id: int, item: dict, source=("backfill", None),
                    existing: Optional[list] = None) -> Optional[dict]:
    """Stores one cleaned key date (memory_schema.clean_key_date) unless it's
    already known.

    A person has ONE birthday (per subject): the same date again adds nothing,
    a month-only date is completed when the day turns up later, and a
    different date from a note replaces an earlier note-derived one (the
    later note is the correction). A date the user entered by hand is never
    overwritten by a note."""
    dates = existing if existing is not None else db.get_key_dates(user_id, person_id)
    for kd in dates:
        if not _same_date(kd, item):
            continue
        if (kd["month"], kd.get("day")) == (item["month"], item.get("day")):
            fields = {}
            if item.get("subject_name") and not kd.get("subject_name"):
                fields["subject_name"] = item["subject_name"]
            if item.get("year") and not kd.get("year"):
                fields["year"] = item["year"]
            if fields:
                db.update_key_date(user_id, kd["id"], **fields)
                kd.update(fields)
            return None
        if kd.get("source_type") == "manual" and source[0] != "manual":
            return None
        if item["date_type"] == "custom":
            continue  # two custom dates can share a label (e.g. different years) - keep both
        fields = {"month": item["month"], "day": item.get("day"), "year": item.get("year") or kd.get("year"),
                  "source_type": source[0], "source_id": source[1]}
        db.update_key_date(user_id, kd["id"], **fields)
        kd.update(fields)
        return kd
    new = db.insert_key_date(
        user_id, person_id=person_id, date_type=item["date_type"], label=item["label"], subject=item["subject"],
        subject_name=item.get("subject_name"), month=item["month"], day=item.get("day"), year=item.get("year"),
        source_type=source[0], source_id=source[1])
    if existing is not None:
        existing.append(new)
    return new


def remove_key_date(user_id: str, key_date_id: int) -> None:
    db.delete_key_dates(user_id, [key_date_id])


# ---------------------------------------------------------------- write hooks

def _parse_day(value) -> Optional[date]:
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _find_linked(by_name: dict, name: Optional[str]) -> Optional[int]:
    """The person (among those linked to this note) a relative's name points
    at: the full name, or a first name that only one of them has."""
    key = (name or "").strip().lower()
    if not key:
        return None
    if key in by_name:
        return by_name[key]
    firsts = {pid for n, pid in by_name.items() if n.split() and n.split()[0] == key}
    return next(iter(firsts)) if len(firsts) == 1 else None


def _family_names(linked_others: list) -> dict:
    """{"spouse": ["Karan"], "child": ["Anya"], ...} - who the note's other
    people are to the person it is about, from the words the note used."""
    out: dict = {}
    for o in linked_others or []:
        out.setdefault(memory_schema.rel_type_of(o.get("relation")), []).append(o.get("name"))
    return out


def _fill_relative(subject: str, name: Optional[str], family: dict, owner_name: Optional[str]):
    """The model sometimes says 'their anniversary' without naming the spouse.
    If the note linked exactly one person as that kind of relative, that is who."""
    if subject == "self" or (name and name.strip().lower() == (owner_name or "").strip().lower()):
        return "self", None
    if not name and len(family.get(subject, [])) == 1:
        return subject, family[subject][0]
    return subject, name


def _store_items(user_id: str, person_id: int, entry: dict, source, ref_date: Optional[date], observed_on,
                 by_name: Optional[dict] = None, owner_name: Optional[str] = None,
                 tally: Optional[dict] = None, names: Optional[dict] = None, family: Optional[dict] = None) -> set:
    """Files the facts and key dates an extraction entry (the primary person
    or one of other_people) carried. Returns the ids of the people written to.

    A detail about a relative who is ALSO a contact in this note belongs on
    that contact's own record: Anya's birthday goes on Anya (as her own), a
    wedding anniversary goes on both partners (each with the other as the
    spouse). A relative who is not a contact stays on this person, labelled
    with who it is about ("child Anya")."""
    by_name = by_name or {}
    names = names or {}
    tally = tally if tally is not None else {"facts": 0, "key_dates": 0, "items": []}
    touched = {person_id}

    def who(pid):
        return names.get(pid) or owner_name or "them"

    def note_fact(pid, row, attribute, value):
        if row:
            tally["facts"] += 1
            tally["items"].append(f"{who(pid)}: {attribute.replace('_', ' ')} · {value}")

    def note_date(pid, row, item):
        if row:
            tally["key_dates"] += 1
            when = f"{item['day']} {calendar.month_name[item['month']]}" if item.get("day") else calendar.month_name[item["month"]]
            tally["items"].append(f"{who(pid)}: {item['label']} · {when}")

    family = family or {}
    entry_dates = list(entry.get("key_dates") or [])
    entry_facts = []
    for f in memory_schema.clean_facts(entry.get("facts")):
        milestone = memory_schema.birthday_from_age_milestone(f["value"])
        if milestone:  # "turns 5 in June" is a birthday, not a fact to file as prose
            entry_dates.append({"label": "Birthday", "date_type": "birthday", "subject": f["subject"],
                                "subject_name": f["subject_name"], **milestone})
        else:
            entry_facts.append(f)
    for f in entry_facts:
        f["subject"], f["subject_name"] = _fill_relative(f["subject"], f["subject_name"], family, owner_name)
        relative = _find_linked(by_name, f["subject_name"]) if f["subject"] != "self" else None
        if relative and relative != person_id:
            note_fact(relative, record_fact(user_id, relative, f["attribute"], f["value"], source, observed_on,
                                            confidence=f["confidence"]), f["attribute"], f["value"])
            touched.add(relative)
        else:
            note_fact(person_id, record_fact(user_id, person_id, f["attribute"], f["value"], source, observed_on,
                                             subject=f["subject"], subject_name=f["subject_name"],
                                             confidence=f["confidence"]), f["attribute"], f["value"])
    for item in memory_schema.clean_key_dates(entry_dates, ref_date):
        item["subject"], item["subject_name"] = _fill_relative(item["subject"], item["subject_name"], family, owner_name)
        relative = _find_linked(by_name, item["subject_name"]) if item["subject"] != "self" else None
        if relative and relative != person_id:
            if item["date_type"] == "anniversary":
                note_date(person_id, record_key_date(user_id, person_id, item, source), item)
                mirrored = dict(item, subject=item["subject"], subject_name=owner_name)
                record_key_date(user_id, relative, mirrored, source)
            else:
                note_date(relative, record_key_date(user_id, relative, dict(item, subject="self", subject_name=None), source), item)
            touched.add(relative)
        else:
            note_date(person_id, record_key_date(user_id, person_id, item, source), item)
    return touched


def memory_payload(extracted: dict) -> dict:
    """The facts and dates an extraction carried, in a form small enough to keep
    with the note - so everything filed from it can be rebuilt later without
    asking the model again."""
    def part(entry):
        return {k: entry[k] for k in ("facts", "key_dates") if entry.get(k)}

    out = {}
    primary = extracted.get("primary_person") or {}
    if part(primary):
        out["primary_person"] = part(primary)
    others = [dict(name=o.get("name"), **part(o)) for o in extracted.get("other_people") or []
              if isinstance(o, dict) and part(o)]
    if others:
        out["other_people"] = others
    return out


def on_capture(user_id: str, interaction_id: int, interaction_date: str, person_id: Optional[int],
               extracted: dict, linked_others: list) -> None:
    """Called after a note is saved (background thread - see capture).
    Files everything the extraction found into person_fact, key_date and
    relationship, then refreshes the search cards of the people it touched."""
    source = ("interaction", interaction_id)
    ref_date = _parse_day(interaction_date)
    primary = extracted.get("primary_person") or {}
    touched = set()
    tally = {"facts": 0, "key_dates": 0, "links": 0, "items": []}
    by_name = {(o.get("name") or "").strip().lower(): o["person_id"] for o in linked_others or []}
    family = _family_names(linked_others)
    names = {p["id"]: p["name"] for p in db.get_all_people(user_id)}
    if person_id and primary:
        facts = db.get_person_facts(user_id, person_id)
        for attr in ("role", "company", "phone", "email"):
            record_fact(user_id, person_id, attr, primary.get(attr) or "", source, interaction_date, facts)
        if primary.get("personal_notes"):
            record_fact(user_id, person_id, "personal", primary["personal_notes"], source, interaction_date, facts)
        if primary.get("description"):
            record_fact(user_id, person_id, "trait", primary["description"], source, interaction_date, facts)
        touched |= _store_items(user_id, person_id, primary, source, ref_date, interaction_date, by_name,
                                names.get(person_id) or primary.get("name"), tally, names, family)
        if primary.get("company"):
            set_employer(user_id, person_id, primary["company"], primary.get("role") or "", source, interaction_date)

    # Details the note gave about the OTHER people in it (a spouse's
    # birthday, a child's hobby) belong to those people.
    for entry in extracted.get("other_people") or []:
        if not isinstance(entry, dict):
            continue
        pid = by_name.get((entry.get("name") or "").strip().lower())
        if pid and (entry.get("facts") or entry.get("key_dates")):
            touched |= _store_items(user_id, pid, entry, source, ref_date, interaction_date, by_name, names.get(pid),
                                    tally, names, {})

    for other in linked_others or []:
        label = (other.get("relation") or "").strip()
        if not label:
            continue
        if person_id and other["person_id"] != person_id:
            db.upsert_relationship(
                user_id, src_type="person", src_id=other["person_id"], rel=relation_type(label),
                rel_type=memory_schema.rel_type_of(label), dst_type="person", dst_id=person_id, label=label,
                source_type=source[0], source_id=source[1], valid_from=interaction_date, valid_to=None)
            touched.update({other["person_id"], person_id})
            tally["links"] += 1
            tally["items"].append(f"{names.get(other['person_id'], other['name'])} is {names.get(person_id) or 'their'}'s "
                                  f"{memory_schema.rel_type_of(label)}")
        elif not person_id:
            record_fact(user_id, other["person_id"], "relation_to_me", label, source, interaction_date)
            touched.add(other["person_id"])

    if touched:
        import search_index  # the person cards now carry the new facts and dates

        search_index.enqueue(user_id, "person", sorted(touched))
    return tally


def on_person_edit(user_id: str, person_id: int, fields: dict) -> None:
    """A manual edit on the profile screen is a fact too (source 'manual')."""
    facts = db.get_person_facts(user_id, person_id)
    for attr in ("role", "company", "phone", "email"):
        if fields.get(attr):
            record_fact(user_id, person_id, attr, fields[attr], ("manual", None), date.today().isoformat(), facts)
    if fields.get("company"):
        set_employer(user_id, person_id, fields["company"], fields.get("role") or "", ("manual", None),
                     date.today().isoformat())


def add_manual_fact(user_id: str, person_id: int, attribute: str, value: str, subject: str = "self",
                    subject_name: Optional[str] = None) -> Optional[dict]:
    """A fact typed in on the profile screen."""
    fact = record_fact(user_id, person_id, attribute, value, ("manual", None), date.today().isoformat(),
                       subject=subject, subject_name=subject_name)
    _refresh_person_card(user_id, person_id)
    return fact


def add_manual_key_date(user_id: str, person_id: int, raw: dict) -> Optional[dict]:
    """A date typed in on the profile screen (month/day/year or a phrase)."""
    item = memory_schema.clean_key_date(raw)
    if not item:
        return None
    row = record_key_date(user_id, person_id, item, ("manual", None))
    _refresh_person_card(user_id, person_id)
    return row


def _refresh_person_card(user_id: str, person_id: int) -> None:
    try:
        import search_index

        search_index.enqueue(user_id, "person", [person_id])
    except Exception:
        pass


def on_document(user_id: str, doc: dict) -> None:
    """Links a document to whose it is - a person, or a known organization."""
    if doc.get("person_id"):
        db.upsert_relationship(user_id, src_type="document", src_id=doc["id"], rel="belongs_to", dst_type="person",
                               dst_id=doc["person_id"], label=None, source_type="document", source_id=doc["id"])
    owner = doc.get("owner")
    if owner and owner != "Me":
        org = find_org(user_id, owner)
        if org:
            db.upsert_relationship(user_id, src_type="document", src_id=doc["id"], rel="belongs_to",
                                   dst_type="organization", dst_id=org["id"], label=None,
                                   source_type="document", source_id=doc["id"])


def forget(user_id: str, entity_type: str, entity_id: int) -> None:
    """Drops an entity's links, facts and dates (person/document deleted)."""
    db.delete_relationships(user_id, [e["id"] for e in db.get_relationships(user_id, entity_type, entity_id)])
    if entity_type == "person":
        db.delete_person_facts(user_id, [f["id"] for f in db.get_person_facts(user_id, entity_id)])
        db.delete_key_dates(user_id, [k["id"] for k in db.get_key_dates(user_id, entity_id)])


def repoint(user_id: str, source_person: int, target_person: int) -> None:
    """After a merge: the merged-away person's facts, dates and links move to the target."""
    for f in db.get_person_facts(user_id, source_person):
        db.update_person_fact(user_id, f["id"], person_id=target_person)
    keep = db.get_key_dates(user_id, target_person)
    for k in db.get_key_dates(user_id, source_person):
        if any(_same_date(t, k) and (t["month"], t.get("day")) == (k["month"], k.get("day")) for t in keep):
            db.delete_key_dates(user_id, [k["id"]])  # the target already has this date
        else:
            db.update_key_date(user_id, k["id"], person_id=target_person)
    for e in db.get_relationships(user_id, "person", source_person):
        fields = {}
        if e["src_type"] == "person" and e["src_id"] == source_person:
            fields["src_id"] = target_person
        if e["dst_type"] == "person" and e["dst_id"] == source_person:
            fields["dst_id"] = target_person
        new_src, new_dst = fields.get("src_id", e["src_id"]), fields.get("dst_id", e["dst_id"])
        if e["src_type"] == e["dst_type"] == "person" and new_src == new_dst:
            db.delete_relationships(user_id, [e["id"]])  # would now link the person to themself
            continue
        try:
            db.update_relationship(user_id, e["id"], **fields)
        except Exception:
            db.delete_relationships(user_id, [e["id"]])  # an identical link already exists on the target


# ---------------------------------------------------------------- read side

def person_facts(user_id: str, person_id: int) -> dict:
    """{"current": {attr: [values]}, "history": [{attribute, value, since, until}]}.
    Kept for callers that only want the simple shape; person_memory() is the full one."""
    current, history = {}, []
    for f in db.get_person_facts(user_id, person_id):
        if f["superseded_by"] is None:
            current.setdefault(f["attribute"], []).append(f["value"])
        else:
            history.append({"attribute": f["attribute"], "value": f["value"], "since": f.get("observed_on"),
                            "until": f.get("valid_to")})
    return {"current": current, "history": history}


def _name_of(user_id: str, entity_type: str, entity_id: int, people: dict, orgs: dict, docs: dict) -> Optional[str]:
    if entity_type == "person":
        return (people.get(entity_id) or {}).get("name")
    if entity_type == "organization":
        return (orgs.get(entity_id) or {}).get("name")
    if entity_type == "document":
        return (docs.get(entity_id) or {}).get("title")
    return None


def _graph_context(user_id: str) -> dict:
    """Everything connections() needs, fetched once (so a whole-account
    pass doesn't re-read it for every person)."""
    try:
        docs = {d["id"]: d for d in db.get_documents(user_id)}
    except Exception:
        docs = {}
    return {"people": {p["id"]: p for p in db.get_all_people(user_id)},
            "orgs": {o["id"]: o for o in db.get_organizations(user_id)},
            "docs": docs, "edges": db.get_relationships(user_id)}


def connections(user_id: str, entity_type: str, entity_id: int, _ctx: Optional[dict] = None) -> list:
    """Everything one hop away, as readable rows - plus colleagues (people
    at the same current organization) for a person. For a person-to-person
    link `relation` says what the OTHER person is to this one ("sibling",
    "parent"), whichever way the link was stored."""
    ctx = _ctx or _graph_context(user_id)
    people, orgs, docs, edges = ctx["people"], ctx["orgs"], ctx["docs"], ctx["edges"]
    out = []
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
        rel_type = e.get("rel_type")
        relation = None
        if rel_type and other[0] == "person" and entity_type == "person":
            relation = rel_type if direction == "in" else memory_schema.INVERSE_REL_TYPE.get(rel_type, rel_type)
        out.append({"rel": e["rel"], "relation": relation, "direction": direction, "type": other[0],
                    "id": other[1], "name": name, "label": e.get("label"),
                    "since": e.get("valid_from"), "until": e.get("valid_to")})
    if entity_type == "person":
        current_orgs = {e["dst_id"] for e in edges if e["rel"] == "works_at" and e["src_type"] == "person"
                        and e["src_id"] == entity_id and e["valid_to"] is None}
        for e in edges:
            if e["rel"] == "works_at" and e["dst_id"] in current_orgs and e["src_id"] != entity_id \
                    and e["valid_to"] is None and e["src_id"] in people:
                out.append({"rel": "colleague", "relation": "colleague", "direction": "same_org", "type": "person",
                            "id": e["src_id"], "name": people[e["src_id"]]["name"], "label": e.get("label"),
                            "at": orgs.get(e["dst_id"], {}).get("name")})
    return out


def _fact_row(f: dict) -> dict:
    return {"id": f["id"], "attribute": f["attribute"], "value": f["value"], "subject": f.get("subject") or "self",
            "subject_name": f.get("subject_name"), "confidence": f.get("confidence") or "stated",
            "is_sensitive": bool(f.get("is_sensitive")), "since": f.get("observed_on"), "until": f.get("valid_to"),
            "source": f.get("source_type")}


def _date_row(k: dict, today: date) -> dict:
    row = {"id": k["id"], "date_type": k["date_type"], "label": k.get("label"), "subject": k.get("subject") or "self",
           "subject_name": k.get("subject_name"), "month": k["month"], "day": k.get("day"), "year": k.get("year"),
           "source": k.get("source_type")}
    row["days_until"] = memory_schema.days_until(k["month"], k.get("day"), today)
    row["text"] = memory_schema.describe_key_date(row, today)
    return row


def person_memory(user_id: str, person_id: int, today: Optional[date] = None, _ctx: Optional[dict] = None,
                  _facts: Optional[list] = None, _dates: Optional[list] = None) -> dict:
    """Everything remembered about one person, ready to show or to hand to
    the answering model: current facts, what they replaced, key dates (with
    days until the next one) and people they're linked to."""
    today = today or date.today()
    facts = _facts if _facts is not None else db.get_person_facts(user_id, person_id)
    dates = _dates if _dates is not None else db.get_key_dates(user_id, person_id)
    return {
        "facts": [_fact_row(f) for f in facts if f["superseded_by"] is None],
        "history": [_fact_row(f) for f in facts if f["superseded_by"] is not None],
        "key_dates": [_date_row(k, today) for k in dates],
        "relationships": [c for c in connections(user_id, "person", person_id, _ctx) if c["type"] == "person"],
    }


def all_person_memory(user_id: str, person_ids: Optional[list] = None, today: Optional[date] = None) -> dict:
    """{person_id: person_memory(...)} for many people with a handful of
    queries in total - used when the search cards are built in bulk."""
    ctx = _graph_context(user_id)
    ids = person_ids if person_ids is not None else list(ctx["people"])
    facts_by, dates_by = {}, {}
    for f in db.get_person_facts(user_id):
        facts_by.setdefault(f["person_id"], []).append(f)
    for k in db.get_key_dates(user_id):
        dates_by.setdefault(k["person_id"], []).append(k)
    return {pid: person_memory(user_id, pid, today, ctx, facts_by.get(pid, []), dates_by.get(pid, [])) for pid in ids}


def upcoming_key_dates(user_id: str, within_days: int = 30, date_types=None, person_id: Optional[int] = None,
                       month: Optional[int] = None, today: Optional[date] = None) -> list:
    """Key dates falling within the next `within_days` days (or in calendar
    `month`), soonest first, each with the person's name. A month-only date
    is listed under its month with days_until = None."""
    today = today or date.today()
    people = {p["id"]: p for p in db.get_all_people(user_id)}
    wanted = set(date_types) if date_types else None
    out = []
    for k in db.get_key_dates(user_id, person_id):
        person = people.get(k["person_id"])
        if not person or (wanted and k["date_type"] not in wanted):
            continue
        row = _date_row(k, today)
        row.update({"person_id": person["id"], "person": person["name"]})
        if month is not None:
            if k["month"] != month:
                continue
        elif row["days_until"] is None or row["days_until"] > within_days:
            continue
        out.append(row)
    seen, deduped = set(), []
    for r in sorted(out, key=lambda r: (r["person"].lower(), r["id"])):
        key = (r["id"],)
        if r["date_type"] == "anniversary" and r["subject"] == "spouse" and r.get("subject_name"):
            key = (r["date_type"], r["month"], r["day"],
                   frozenset({r["person"].strip().lower(), r["subject_name"].strip().lower()}))
        if key not in seen:
            seen.add(key)
            deduped.append(r)
    out = deduped
    out.sort(key=lambda r: (r["days_until"] if r["days_until"] is not None else 999, r["person"].lower()))
    return out


def _event_title(k: dict, person: str, on: date) -> str:
    """How a yearly date reads on a calendar: "Priya's birthday (turns 36)"."""
    label = k.get("label") or k["date_type"].title()
    who = k.get("subject_name")
    if k["date_type"] == "birthday":
        owner = who if (k.get("subject") or "self") != "self" and who else person
        age = f" (turns {on.year - k['year']})" if k.get("year") and on.year >= k["year"] else ""
        return f"{owner}'s birthday{age}"
    if k["date_type"] == "anniversary":
        pair = f"{person} & {who}" if who else person
        return f"{label}: {pair}"
    return f"{person}: {label}"


def key_date_occurrences(user_id: str, start: date, end: date) -> list:
    """Every yearly date that FALLS on a day between `start` and `end`
    (inclusive), one row per occurrence, soonest first - what a calendar needs.
    A date with no known day ("Anya's birthday: June") can't be placed on a
    day, so it is left out. Feb 29 falls on Feb 28 in a non-leap year. One
    wedding anniversary is one row, not one per partner."""
    people = {p["id"]: p for p in db.get_all_people(user_id)}
    rows = []
    for k in db.get_key_dates(user_id):
        person = people.get(k["person_id"])
        if not person or k.get("day") is None:
            continue
        for year in range(start.year, end.year + 1):
            on = memory_schema.occurrence_in_year(k["month"], k["day"], year)
            if not (start <= on <= end):
                continue
            row = {"date": on.isoformat(), "key_date_id": k["id"], "person_id": person["id"], "person": person["name"],
                   "date_type": k["date_type"], "label": k.get("label"), "subject": k.get("subject") or "self",
                   "subject_name": k.get("subject_name"), "title": _event_title(k, person["name"], on)}
            if k["date_type"] == "birthday" and k.get("year") and on.year >= k["year"]:
                row["age"] = on.year - k["year"]
            rows.append(row)
    seen, out = set(), []
    for r in sorted(rows, key=lambda r: (r["date"], r["person"].lower(), r["key_date_id"])):
        key = (r["key_date_id"], r["date"])
        if r["date_type"] == "anniversary" and r["subject"] == "spouse" and r.get("subject_name"):
            # The same couple's anniversary, seen from either partner. Matched by the two
            # NAMES, not ids: two contacts can share a name, which made an id lookup pick the wrong one.
            key = ("anniversary", r["date"], frozenset({r["person"].strip().lower(), r["subject_name"].strip().lower()}))
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def query_people(user_id: str, attribute: Optional[str] = None, value: Optional[str] = None,
                 relation: Optional[str] = None, subject: Optional[str] = None) -> list:
    """People matching ALL the filters - 'which friends are vegetarian' is
    attribute=diet, value=vegetarian, relation=friend. `value` matches whole
    words of a fact's value; `relation` matches a contact's tags, their
    'relation to me' fact, or a spouse/parent/... link."""
    people = {p["id"]: p for p in db.get_all_people(user_id)}
    facts = [f for f in db.get_person_facts(user_id) if f["superseded_by"] is None]
    attr = memory_schema.normalise_attribute(attribute) if attribute else None
    want_words = set(memory_schema.value_norm(value).split()) if value else set()
    matched = {}
    for f in facts:
        if f["person_id"] not in people:
            continue
        if attr and f["attribute"] != attr:
            continue
        if (f.get("subject") or "self") != (subject or "self"):
            continue  # "who likes coffee" means who, not whose child likes it
        if want_words and not want_words <= set(memory_schema.value_norm(f["value"]).split()):
            continue
        matched.setdefault(f["person_id"], []).append(_fact_row(f))
    if not attr and not value and not subject:
        matched = {pid: [] for pid in people}  # no fact filter - start from everyone
    rel = (relation or "").strip().lower().rstrip("s") if relation else None
    if rel:
        keep = {}
        edges = db.get_relationships(user_id)
        for pid, rows in matched.items():
            p = people[pid]
            tags = [t.lower().rstrip("s") for t in (p.get("tags") or [])]
            rel_facts = [f["value"].lower() for f in facts if f["person_id"] == pid and f["attribute"] == "relation_to_me"]
            linked = any(e.get("rel_type") and (e["rel_type"] == rel or rel in (e.get("label") or "").lower())
                         and "person" in (e["src_type"], e["dst_type"]) and pid in (e["src_id"], e["dst_id"])
                         for e in edges)
            if rel in tags or any(rel in v for v in rel_facts) or linked:
                keep[pid] = rows
        matched = keep
    return [{"person_id": pid, "name": people[pid]["name"], "role": people[pid].get("role"),
             "company": people[pid].get("company"), "matches": rows}
            for pid, rows in sorted(matched.items(), key=lambda kv: people[kv[0]]["name"].lower())]


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
    for e in db.get_relationships(user_id, "organization", org_id):
        if e["rel"] == "works_at" and e["src_id"] in people:
            row = {"person_id": e["src_id"], "name": people[e["src_id"]]["name"], "role": e.get("label"),
                   "since": e.get("valid_from"), "until": e.get("valid_to")}
            (former if e.get("valid_to") else current).append(row)
        elif e["rel"] == "belongs_to" and e["src_type"] == "document" and e["src_id"] in docs:
            documents.append({"document_id": e["src_id"], "title": docs[e["src_id"]]["title"]})
    return {"id": org["id"], "name": org["name"], "people": current, "former_people": former, "documents": documents}


# ---------------------------------------------------------------- rebuild

def _legacy_key_dates(person: dict) -> list:
    """Dates saved on person.important_dates (an encrypted JSON list, written
    by the earlier version of this feature) as [{label, month, day, year}]."""
    raw = person.get("important_dates")
    if not raw:
        return []
    try:
        entries = raw if isinstance(raw, list) else crypto_utils.decrypt_json(raw)
    except Exception:
        return []
    if isinstance(entries, str):
        try:
            import json

            entries = json.loads(entries)
        except ValueError:
            return []
    return entries if isinstance(entries, list) else []


def rebuild_user(user_id: str) -> dict:
    """(Re)derives the whole graph from source tables - backfill and repair.
    Idempotent: existing facts, dates and links are recognised, not duplicated."""
    stats = {"organizations": 0, "facts": 0, "key_dates": 0, "relationships": 0}
    people = db.get_all_people(user_id)
    for p in people:
        facts = db.get_person_facts(user_id, p["id"])
        before = len(facts)
        since = p.get("first_met_date")
        for attr in ("role", "company", "phone", "email"):
            record_fact(user_id, p["id"], attr, p.get(attr) or "", ("backfill", None), since, facts)
        for entry in p.get("personal_notes") or []:
            record_fact(user_id, p["id"], "personal", entry.get("note") or "", ("backfill", None),
                        entry.get("date"), facts)
        if p.get("description"):
            record_fact(user_id, p["id"], "trait", p["description"], ("backfill", None), since, facts)
        stats["facts"] += len(facts) - before + repair_moves(user_id, p["id"])
        dates = db.get_key_dates(user_id, p["id"])
        for k in dates:  # an anniversary is shared with a spouse, never "their own"
            if k["date_type"] == "anniversary" and (k.get("subject") or "self") == "self":
                db.update_key_date(user_id, k["id"], subject="spouse")
                k["subject"] = "spouse"
        before = len(dates)
        for item in memory_schema.clean_key_dates(_legacy_key_dates(p)):
            record_key_date(user_id, p["id"], item, ("backfill", None), dates)
        stats["key_dates"] += len(dates) - before
        if p.get("company"):
            set_employer(user_id, p["id"], p["company"], p.get("role") or "", ("backfill", None), since)
    # Notes whose extraction was kept (extracted_facts.memory): file it again.
    # Anything already there is recognised, anything that never got filed is added.
    by_id = {p["id"]: p for p in people}
    links_by_note: dict = {}
    for l in db.get_interaction_links(user_id):
        links_by_note.setdefault(l["interaction_id"], []).append(l)
    for n in db.get_all_interactions(user_id):
        payload = (n.get("extracted_facts") or {}).get("memory")
        if not payload or not n.get("person_id") or n["person_id"] not in by_id:
            continue
        said = {(o.get("name") or "").strip().lower(): o.get("relation") or ""
                for o in (n.get("extracted_facts") or {}).get("other_people") or [] if isinstance(o, dict)}
        linked = [{"name": by_id[l["person_id"]]["name"], "person_id": l["person_id"],
                   "relation": l.get("relation") or said.get(by_id[l["person_id"]]["name"].strip().lower(), "")}
                  for l in links_by_note.get(n["id"], []) if l["person_id"] in by_id]
        extracted = {"primary_person": dict(payload.get("primary_person") or {}, name=by_id[n["person_id"]]["name"]),
                     "other_people": payload.get("other_people") or []}
        replayed = on_capture(user_id, n["id"], n.get("date") or "", n["person_id"], extracted, linked)
        stats["key_dates"] += replayed["key_dates"]
        stats["facts"] += replayed["facts"]
    # A wedding anniversary belongs to BOTH partners: if one has it and the
    # spouse is a contact who doesn't, add it there (repairs earlier captures).
    by_full_name = {}
    for p in people:
        by_full_name.setdefault(p["name"].strip().lower(), []).append(p["id"])
    for p in people:
        for k in db.get_key_dates(user_id, p["id"]):
            if k["date_type"] != "anniversary" or k.get("subject") != "spouse":
                continue
            ids = by_full_name.get((k.get("subject_name") or "").strip().lower(), [])
            if len(ids) == 1 and ids[0] != p["id"]:
                mirrored = {"date_type": "anniversary", "label": k.get("label") or "Anniversary", "subject": "spouse",
                            "subject_name": p["name"], "month": k["month"], "day": k.get("day"), "year": k.get("year")}
                if record_key_date(user_id, ids[0], mirrored, ("backfill", None)):
                    stats["key_dates"] += 1
    # Links recorded on notes: extracted_facts.other_people[].relation, tied to the note by interaction_person.
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
                    db.upsert_relationship(
                        user_id, src_type="person", src_id=pid, rel=relation_type(label),
                        rel_type=memory_schema.rel_type_of(label), dst_type="person", dst_id=n["person_id"],
                        label=label, source_type="interaction", source_id=n["id"],
                        valid_from=n.get("date"), valid_to=None)
                elif not n.get("person_id"):
                    record_fact(user_id, pid, "relation_to_me", label, ("interaction", n["id"]), n.get("date"))
    try:
        for d in db.get_documents(user_id):
            on_document(user_id, d)
    except Exception:
        pass  # documents table not migrated
    stats["organizations"] = len(db.get_organizations(user_id))
    stats["relationships"] = len(db.get_relationships(user_id))
    return stats
