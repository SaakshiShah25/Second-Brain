"""
views/chat_view.py — The "Chat" page: log a note, ask a question, or scan
a business card. This is the original single-page app.py content,
relocated behind a render() function so it can be one page of a
multi-page st.navigation() app (see app.py). Two additions since then:
  - A st.audio_input widget that transcribes via voice.py and feeds the
    result through the exact same handle_capture()/handle_retrieval() used
    for typed text - voice is an input method, not a separate pipeline.
  - A "Scan a card" mode: st.camera_input() -> card_scan.py (OCR +
    structuring) -> an editable confirm form -> _process_extracted(), the
    same person-resolution tail handle_capture() uses for typed notes, so
    a scanned name that matches an existing person gets the exact same
    disambiguation-buttons UI a typed note would.

Design decisions (unchanged from the original app.py):
  - CHAT INTERFACE: both "log a note" and "ask a question" are naturally
    just typing a sentence and getting a response, so a single chat surface
    fits better than separate forms.
  - EXPLICIT MODE TOGGLE (sidebar), not auto-detected intent: whether a
    message is a note-to-save or a question-to-answer is deliberately a
    one-click choice rather than an LLM guess, to avoid misclassification
    and keep it fast/cheap. Easy to swap for auto-detection later if wanted.
  - The CLI scripts (capture.py / retrieval.py) use blocking input() for
    person-disambiguation, which doesn't work in a web UI. This file
    reimplements that step using Streamlit session_state + buttons instead,
    but calls into the exact same underlying building blocks (db.py,
    extraction.py, embeddings.py, person_match.py, retrieval.py's
    parse_query/select_by_scope/synthesize_answer) rather than duplicating
    their logic.
"""

from datetime import date
from typing import Optional

import streamlit as st

import capture
import card_scan
import db
import extraction
import embeddings
import person_match
import retrieval
import voice
from date_utils import to_valid_date


# ---------- Session state ----------

def init_state():
    defaults = {
        "chat_history": [],       # list of {"role": "user"/"assistant", "content": str}
        "pending_capture": None,  # dict while waiting on a person-disambiguation choice
        "pending_retrieval": None,
        "pending_card": None,     # dict while waiting on a scanned-card confirm/edit
        "last_audio_sig": None,   # signature of the last-transcribed audio_input value
        "last_card_sig": None,    # signature of the last-scanned camera_input value
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


# ---------- Capture flow ----------

def _resolve_interaction_date(extracted: dict):
    """Validates extracted['date_mentioned'] before it reaches Postgres - an
    LLM occasionally returns a partial date (e.g. "2026-09" for "sometime
    in September"), which the `date` column rejects outright. Returns
    (resolved_date, warning_or_None). Falls back to today if missing/invalid."""
    raw_date = extracted.get("date_mentioned")
    resolved = to_valid_date(raw_date) or date.today().isoformat()
    warning = None
    if raw_date and not to_valid_date(raw_date):
        warning = f"note: extracted date '{raw_date}' wasn't complete, used {resolved} instead"
    return resolved, warning


def finish_capture_storage(person_id: int, resolved_name: str, created_new: bool,
                            raw_text: str, extracted: dict, interaction_date: str, date_warning: Optional[str]):
    """Stores the Interaction + Tasks once the person is resolved, then
    posts a confirmation message to the chat. `interaction_date` is the
    already-resolved/validated date (see _resolve_interaction_date) -
    resolved once, upstream, so it can also be used as a new person's
    first_met_date before this function ever runs."""
    with st.spinner("Saving..."):
        embedding = embeddings.compute_embedding(raw_text)
        sentiments = extracted.get("sentiments") or []
        extracted_facts = {
            "other_people": extracted.get("other_people", []),
            "opinions_expressed": extracted.get("opinions_expressed", []),
        }

        interaction_id = db.create_interaction(
            person_id=person_id,
            raw_text=raw_text,
            date=interaction_date,
            location=extracted.get("location"),
            appearance=extracted.get("appearance_this_meeting", "") or "",
            summary=extracted.get("summary", ""),
            sentiment=sentiments,
            topics=extracted.get("topics", []),
            extracted_facts=extracted_facts,
            embedding=embedding,
        )

        capture.resolve_and_link_other_people(
            interaction_id, extracted.get("other_people", []) or [], interaction_date
        )

        tasks_created = []
        skipped_due_dates = []
        for item in extracted.get("follow_ups", []) or []:
            if isinstance(item, dict):
                task_desc, raw_due_date = item.get("description", ""), item.get("due_date")
            else:
                task_desc, raw_due_date = str(item), None
            if not task_desc:
                continue
            due_date = to_valid_date(raw_due_date)
            if raw_due_date and not due_date:
                skipped_due_dates.append((task_desc, raw_due_date))
            db.create_task(interaction_id, task_desc, due_date=due_date)
            tasks_created.append((task_desc, due_date))

    status = "🆕 Logged a new person" if created_new else "🔗 Matched to existing person"
    lines = [f"**{status}:** {resolved_name}"]
    if extracted.get("summary"):
        lines.append(f"**Summary:** {extracted['summary']}")
    if tasks_created:
        lines.append("**Follow-ups:**")
        for desc, due in tasks_created:
            lines.append(f"- {desc}" + (f" _(due {due})_" if due else ""))
    if date_warning:
        lines.append(f"_⚠️ {date_warning}_")
    if skipped_due_dates:
        for desc, bad_date in skipped_due_dates:
            lines.append(f"_⚠️ couldn't set a due date for \"{desc}\" (got '{bad_date}') - saved without one_")

    st.session_state.chat_history.append({"role": "assistant", "content": "\n\n".join(lines)})
    st.session_state.pending_capture = None


def apply_capture_choice(choice_index: Optional[int]):
    """choice_index is None for 'new person', else an index into candidates."""
    pending = st.session_state.pending_capture
    name, description = pending["name"], pending["description"]
    role, company = pending["role"], pending["company"]
    phone, email = pending.get("phone", ""), pending.get("email", "")
    interaction_date, date_warning = pending["interaction_date"], pending["date_warning"]

    if choice_index is None:
        person_id = db.create_person(
            name=name, description=description, role=role, company=company,
            phone=phone, email=email, first_met_date=interaction_date,
        )
        resolved_name, created_new = name, True
    else:
        chosen = pending["candidates"][choice_index][0]
        person_id = chosen["id"]
        if name != chosen["name"]:
            db.add_alias(person_id, name)
        if description:
            db.update_person_description(person_id, description)
        if role or company:
            db.update_person_role_company(person_id, role=role, company=company)
        if phone or email:
            contact_fields = {k: v for k, v in [("phone", phone), ("email", email)] if v}
            db.update_person(person_id, **contact_fields)
        resolved_name, created_new = chosen["name"], False

    finish_capture_storage(person_id, resolved_name, created_new, pending["raw_text"],
                            pending["extracted"], interaction_date, date_warning)


def _process_extracted(raw_text: str, extracted: dict):
    """
    Shared tail of the capture flow: resolves the primary person
    (interactively via pending_capture if ambiguous) and stores the
    interaction. Used by handle_capture() after a text extraction call,
    and by the "Scan a card" flow after OCR+structuring (card_scan.py) -
    either way `extracted` just needs to be shaped like
    extraction.extract_info()'s output; a card scan only ever populates
    "primary_person" (plus "summary"), everything else defaults to empty.
    """
    primary = extracted.get("primary_person", {}) or {}
    name = primary.get("name") or "Unknown"
    description = primary.get("description") or ""
    role = primary.get("role") or ""
    company = primary.get("company") or ""
    phone = primary.get("phone") or ""
    email = primary.get("email") or ""

    interaction_date, date_warning = _resolve_interaction_date(extracted)

    people = db.get_all_people()
    candidates = person_match.score_candidates(name, people)

    if not candidates:
        person_id = db.create_person(
            name=name, description=description, role=role, company=company,
            phone=phone, email=email, first_met_date=interaction_date,
        )
        finish_capture_storage(person_id, name, True, raw_text, extracted, interaction_date, date_warning)
    else:
        st.session_state.pending_capture = {
            "raw_text": raw_text, "extracted": extracted,
            "name": name, "description": description, "role": role, "company": company,
            "phone": phone, "email": email,
            "candidates": candidates,
            "interaction_date": interaction_date, "date_warning": date_warning,
        }


def handle_capture(raw_text: str):
    st.session_state.chat_history.append({"role": "user", "content": raw_text})
    try:
        with st.spinner("Extracting..."):
            extracted = extraction.extract_info(raw_text)
        _process_extracted(raw_text, extracted)
    except Exception as e:
        st.session_state.chat_history.append({
            "role": "assistant",
            "content": f"⚠️ Something went wrong while saving that: {e}",
        })


# ---------- Retrieval flow ----------

def proceed_with_retrieval(query: str, parsed: dict, person: Optional[dict]):
    try:
        if person:
            interactions = retrieval.get_all_interactions_for_person(person["id"])
            if not interactions:
                answer = f"I don't have any interactions recorded for {person['name']} yet."
            else:
                selected = retrieval.select_by_scope(
                    interactions, parsed.get("scope", "all"), parsed.get("specific_date")
                )
                selected = retrieval.attach_tasks(selected)
                with st.spinner("Thinking..."):
                    answer = retrieval.synthesize_answer(query, selected, person)
        else:
            semantic_query = parsed.get("semantic_query") or query
            with st.spinner("Searching..."):
                query_embedding = embeddings.compute_embedding(semantic_query)
                if query_embedding is None:
                    answer = ("I couldn't resolve a specific person from your question, and "
                              "semantic search isn't available right now.")
                else:
                    matches = db.search_interactions_by_embedding(query_embedding, top_k=5)
                    if not matches:
                        answer = "I couldn't find anything matching that."
                    else:
                        selected = db.get_interactions_by_ids([m["id"] for m in matches])
                        selected = retrieval.attach_tasks(selected)
                        answer = retrieval.synthesize_answer(query, selected, None)
    except Exception as e:
        answer = f"⚠️ Something went wrong while looking that up: {e}"

    st.session_state.chat_history.append({"role": "assistant", "content": answer})
    st.session_state.pending_retrieval = None


def handle_retrieval(query: str):
    conversation_context = retrieval.format_recent_context(st.session_state.chat_history)
    st.session_state.chat_history.append({"role": "user", "content": query})
    try:
        with st.spinner("Understanding your question..."):
            parsed = retrieval.parse_query(query, conversation_context=conversation_context)

        person = None
        if parsed.get("person_name"):
            people = db.get_all_people()
            candidates = person_match.score_candidates(parsed["person_name"], people)
            if len(candidates) == 1:
                person = candidates[0][0]
            elif len(candidates) > 1:
                st.session_state.pending_retrieval = {
                    "query": query, "parsed": parsed, "candidates": candidates,
                }
                return

        proceed_with_retrieval(query, parsed, person)
    except Exception as e:
        st.session_state.chat_history.append({
            "role": "assistant",
            "content": f"⚠️ Something went wrong while understanding that question: {e}",
        })


# ---------- Voice input ----------

def handle_voice_input(mode: str):
    """
    Renders the audio recorder and, on a NEW recording, transcribes it via
    voice.py and routes the transcript through the same handle_capture()/
    handle_retrieval() used for typed text. Guards against reprocessing the
    same clip on every Streamlit rerun via a signature stored in
    session_state.
    """
    audio_value = st.audio_input("Or record a note", label_visibility="collapsed")
    if audio_value is None:
        return

    audio_bytes = audio_value.getvalue()
    sig = hash(audio_bytes)
    if st.session_state.get("last_audio_sig") == sig:
        return
    st.session_state.last_audio_sig = sig

    try:
        with st.spinner("Transcribing..."):
            text = voice.transcribe_audio(audio_bytes)
    except Exception as e:
        st.session_state.chat_history.append({
            "role": "assistant",
            "content": f"⚠️ Voice transcription failed: {e}",
        })
        st.rerun()
        return

    if not text or not text.strip():
        st.session_state.chat_history.append({
            "role": "assistant",
            "content": "⚠️ Didn't catch anything in that recording - try again.",
        })
        st.rerun()
        return

    if mode == "capture":
        handle_capture(text)
    else:
        handle_retrieval(text)
    st.rerun()


# ---------- Business card scan ----------

def handle_card_scan(image_bytes: bytes, context_note: str = ""):
    """OCRs+structures a business card photo (card_scan.py) and stashes the
    result for confirmation - see render_pending_card()."""
    try:
        with st.spinner("Reading card..."):
            card = card_scan.extract_business_card(image_bytes)
    except Exception as e:
        st.session_state.chat_history.append({
            "role": "assistant",
            "content": f"⚠️ Couldn't read that card: {e}",
        })
        return
    st.session_state.pending_card = {"card": card, "context_note": context_note}


def render_pending_card():
    """
    Editable confirmation form for a scanned card - unlike voice (trusted
    as-is), a misread structured field like an email address is worse
    silently wrong than a misheard word in a note, so this gets a review
    step voice didn't need. On save, builds an extraction.py-shaped dict
    and reuses _process_extracted() - same disambiguation-buttons UI a
    typed note would get if the scanned name matches an existing person.
    """
    pending = st.session_state.pending_card
    card = pending["card"]
    with st.chat_message("assistant"):
        st.markdown("**Confirm the scanned details before saving:**")
        with st.form("confirm_card_form"):
            name = st.text_input("Name", value=card.get("name", ""))
            role = st.text_input("Role", value=card.get("role", ""))
            company = st.text_input("Company", value=card.get("company", ""))
            phone = st.text_input("Phone", value=card.get("phone", ""))
            email = st.text_input("Email", value=card.get("email", ""))
            context_note = st.text_area(
                "Context (optional - e.g. where you met)", value=pending.get("context_note", "")
            )
            save = st.form_submit_button("Save contact")
            cancel = st.form_submit_button("Cancel")

        if cancel:
            st.session_state.pending_card = None
            st.rerun()

        if save:
            if not name.strip():
                st.error("Name is required.")
                return
            context_note = context_note.strip()
            raw_text = context_note or f"Scanned business card: {name}, {role} at {company}".strip()
            st.session_state.chat_history.append({"role": "user", "content": f"📇 {raw_text}"})
            extracted = {
                "primary_person": {
                    "name": name, "description": "", "role": role, "company": company,
                    "phone": phone, "email": email,
                },
                "date_mentioned": None,
                "location": None,
                "appearance_this_meeting": "",
                "summary": context_note or f"Scanned {name}'s business card",
                "sentiments": [], "topics": [], "other_people": [], "opinions_expressed": [],
                "follow_ups": [],
            }
            st.session_state.pending_card = None
            _process_extracted(raw_text, extracted)


# ---------- Page ----------

def render():
    init_state()

    with st.sidebar:
        st.title("🧠 Second Brain")

        mode_label = st.radio("Mode", ["📝 Log a note", "❓ Ask a question", "📇 Scan a card"], index=0)
        if mode_label.startswith("📝"):
            mode = "capture"
        elif mode_label.startswith("❓"):
            mode = "retrieve"
        else:
            mode = "card"

        st.divider()

        try:
            db.get_client()
            st.success("Supabase connected")
        except Exception as e:
            st.error(f"Supabase not configured: {e}")

        try:
            from llm_client import get_client as get_llm_client
            get_llm_client()
            st.success("Groq connected")
        except Exception as e:
            st.error(f"Groq not configured: {e}")

        st.divider()

        if st.button("Clear conversation"):
            st.session_state.chat_history = []
            st.session_state.pending_capture = None
            st.session_state.pending_retrieval = None
            st.session_state.pending_card = None
            st.rerun()

        try:
            people = db.get_all_people()
            if people:
                st.caption(f"{len(people)} people logged")
                with st.expander("People"):
                    for p in sorted(people, key=lambda x: x["name"]):
                        st.write(f"**{p['name']}**" + (f" · {p['role']}" if p.get("role") else ""))
        except Exception:
            pass

    st.title("Second Brain")

    for msg in st.session_state.chat_history:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    if st.session_state.pending_capture:
        pending = st.session_state.pending_capture
        with st.chat_message("assistant"):
            context_bits = [b for b in [pending["description"], pending["role"], pending["company"]] if b]
            context_str = f" ({', '.join(context_bits)})" if context_bits else ""
            st.markdown(f"The note mentions **'{pending['name']}'**{context_str}. "
                         f"Is this the same person as one of these existing entries?")
            for i, (person, score) in enumerate(pending["candidates"]):
                aliases = person.get("aliases") or []
                alias_str = f" (aka {', '.join(aliases)})" if aliases else ""
                role_company = ", ".join(b for b in [person.get("role"), person.get("company")] if b)
                detail = person.get("description") or "no description yet"
                if role_company:
                    detail = f"{detail} — {role_company}"
                label = f"{person['name']}{alias_str} — {detail}  [{score:.0%} match]"
                if st.button(label, key=f"cap_cand_{i}"):
                    apply_capture_choice(i)
                    st.rerun()
            if st.button(f"None of these — '{pending['name']}' is a new person", key="cap_new_person"):
                apply_capture_choice(None)
                st.rerun()

    elif st.session_state.pending_retrieval:
        pending = st.session_state.pending_retrieval
        with st.chat_message("assistant"):
            st.markdown(f"**'{pending['parsed'].get('person_name')}'** could refer to more than one "
                         f"person you've logged. Who did you mean?")
            for i, (person, score) in enumerate(pending["candidates"]):
                role_company = ", ".join(b for b in [person.get("role"), person.get("company")] if b)
                detail = person.get("description") or "no description yet"
                if role_company:
                    detail = f"{detail} — {role_company}"
                label = f"{person['name']} — {detail}  [{score:.0%} match]"
                if st.button(label, key=f"ret_cand_{i}"):
                    proceed_with_retrieval(pending["query"], pending["parsed"], person)
                    st.rerun()
            if st.button("None of these", key="ret_none"):
                proceed_with_retrieval(pending["query"], pending["parsed"], None)
                st.rerun()

    elif st.session_state.pending_card:
        render_pending_card()

    elif mode == "card":
        image = st.camera_input("Scan a business card")
        context_note = st.text_input("Context (optional - e.g. where you met)")
        if image is not None:
            sig = hash(image.getvalue())
            if st.session_state.get("last_card_sig") != sig:
                st.session_state.last_card_sig = sig
                handle_card_scan(image.getvalue(), context_note)
                st.rerun()

    else:
        handle_voice_input(mode)

        placeholder = "Tell me about a conversation..." if mode == "capture" else "Ask about someone or something..."
        user_input = st.chat_input(placeholder)
        if user_input:
            if mode == "capture":
                handle_capture(user_input)
            else:
                handle_retrieval(user_input)
            st.rerun()
