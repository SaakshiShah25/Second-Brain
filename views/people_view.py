"""
views/people_view.py — The "People" page: browse a person's full
interaction timeline, correct mistakes (person fields or an individual
interaction), and merge duplicate Person rows created by mistake.

Uses db.py's person-management additions (get_person, update_person,
delete_person, merge_persons) and interaction-management additions
(update_interaction, delete_interaction), plus retrieval.attach_tasks()
(reused as-is) to show follow-ups alongside each interaction.

Destructive actions (delete person, delete interaction, merge) are gated
behind an st.dialog confirmation - these are irreversible, so a stray
click shouldn't be enough to trigger them.
"""

from datetime import datetime

import streamlit as st

import db
import retrieval


def _parse_iso_date(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except (ValueError, TypeError):
        return None


def _person_label(p: dict) -> str:
    bits = [p["name"]]
    if p.get("role"):
        bits.append(f"— {p['role']}")
    return " ".join(bits) + f" (id {p['id']})"


# ---------- Confirmation dialogs ----------

@st.dialog("Confirm merge")
def confirm_merge_dialog(source_id, source_name, target_id):
    st.write(f"Merge **{source_name}** into the selected person? All of their interactions "
             f"and follow-ups will be reassigned, and this person record will be removed. "
             f"This cannot be undone.")
    col1, col2 = st.columns(2)
    if col1.button("Cancel", key="merge_cancel"):
        st.rerun()
    if col2.button("Merge", key="merge_confirm", type="primary"):
        new_id = db.merge_persons(source_id, target_id)
        st.session_state.people_view_selected_id = new_id
        st.rerun()


@st.dialog("Confirm delete")
def confirm_delete_person_dialog(person_id, person_name):
    st.write(f"Delete **{person_name}**? This also deletes all of their interactions and "
             f"follow-up tasks. This cannot be undone.")
    col1, col2 = st.columns(2)
    if col1.button("Cancel", key="delperson_cancel"):
        st.rerun()
    if col2.button("Delete", key="delperson_confirm", type="primary"):
        db.delete_person(person_id)
        st.session_state.people_view_selected_id = None
        st.rerun()


@st.dialog("Confirm delete")
def confirm_delete_interaction_dialog(interaction_id):
    st.write("Delete this interaction and its follow-up tasks? This cannot be undone.")
    col1, col2 = st.columns(2)
    if col1.button("Cancel", key="delint_cancel"):
        st.rerun()
    if col2.button("Delete", key="delint_confirm", type="primary"):
        db.delete_interaction(interaction_id)
        st.rerun()


# ---------- Page ----------

def render():
    st.title("🧑‍🤝‍🧑 People")

    try:
        people = db.get_all_people()
    except Exception as e:
        st.error(f"Couldn't load people: {e}")
        return

    if not people:
        st.caption("No one logged yet — log a note on the Chat page first.")
        return

    people_sorted = sorted(people, key=lambda p: p["name"])

    if not st.session_state.get("people_view_selected_id"):
        st.session_state.people_view_selected_id = people_sorted[0]["id"]

    labels_to_id = {_person_label(p): p["id"] for p in people_sorted}
    ids_to_label = {v: k for k, v in labels_to_id.items()}
    label_list = list(labels_to_id.keys())
    current_label = ids_to_label.get(st.session_state.people_view_selected_id)
    default_index = label_list.index(current_label) if current_label else 0

    selected_label = st.selectbox("Select a person", label_list, index=default_index)
    selected_id = labels_to_id[selected_label]
    st.session_state.people_view_selected_id = selected_id

    person = db.get_person(selected_id)
    if not person:
        st.session_state.people_view_selected_id = None
        st.rerun()
        return

    briefings = st.session_state.setdefault("people_briefings", {})
    if st.button("🌅 Get briefing", key=f"brief_{selected_id}"):
        with st.spinner("Preparing briefing..."):
            briefings[selected_id] = retrieval.generate_briefing(selected_id)
    if selected_id in briefings:
        st.info(briefings[selected_id])

    st.subheader("Edit person")
    with st.form("edit_person_form"):
        name = st.text_input("Name", value=person["name"])
        description = st.text_area("Description (general/stable traits)", value=person.get("description") or "")
        role = st.text_input("Role", value=person.get("role") or "")
        company = st.text_input("Company", value=person.get("company") or "")
        phone = st.text_input("Phone", value=person.get("phone") or "")
        email = st.text_input("Email", value=person.get("email") or "")
        tags_str = st.text_input("Tags (comma-separated)", value=", ".join(person.get("tags") or []))
        first_met = st.date_input("First met", value=_parse_iso_date(person.get("first_met_date")))
        if st.form_submit_button("Save changes"):
            tags = [t.strip() for t in tags_str.split(",") if t.strip()]
            db.update_person(
                selected_id,
                name=name,
                description=description,
                role=role,
                company=company,
                phone=phone,
                email=email,
                tags=tags,
                first_met_date=first_met.isoformat() if first_met else None,
            )
            st.success("Saved.")
            st.rerun()

    st.divider()
    st.subheader("Interaction timeline")

    interactions = db.get_interactions_for_person(selected_id)
    interactions = retrieval.attach_tasks(interactions)
    interactions_sorted = sorted(interactions, key=lambda i: i.get("date") or "")

    if not interactions_sorted:
        st.caption("No interactions logged with this person yet.")

    for interaction in interactions_sorted:
        header = f"{interaction.get('date') or 'unknown date'} — {interaction.get('summary') or '(no summary)'}"
        with st.expander(header):
            edit_key = f"edit_mode_{interaction['id']}"
            if edit_key not in st.session_state:
                st.session_state[edit_key] = False

            if not st.session_state[edit_key]:
                if interaction.get("location"):
                    st.caption(f"Location: {interaction['location']}")
                if interaction.get("appearance"):
                    st.caption(f"Appearance that day: {interaction['appearance']}")
                st.write(interaction.get("summary") or "")
                tasks = interaction.get("tasks") or []
                if tasks:
                    st.markdown("**Follow-ups:**")
                    for t in tasks:
                        due = f", due {t['due_date']}" if t.get("due_date") else ""
                        st.write(f"- {t['description']} [{t['status']}{due}]")
                if interaction.get("raw_text"):
                    st.text_area("Original note", value=interaction["raw_text"], height=100,
                                 disabled=True, key=f"raw_{interaction['id']}")

                col1, col2 = st.columns(2)
                if col1.button("Edit", key=f"editbtn_{interaction['id']}"):
                    st.session_state[edit_key] = True
                    st.rerun()
                if col2.button("Delete interaction", key=f"delbtn_{interaction['id']}"):
                    confirm_delete_interaction_dialog(interaction["id"])
            else:
                with st.form(f"edit_interaction_form_{interaction['id']}"):
                    new_date = st.date_input("Date", value=_parse_iso_date(interaction.get("date")))
                    new_location = st.text_input("Location", value=interaction.get("location") or "")
                    new_appearance = st.text_area("Appearance that day", value=interaction.get("appearance") or "")
                    new_summary = st.text_area("Summary", value=interaction.get("summary") or "")
                    new_raw = st.text_area("Raw text", value=interaction.get("raw_text") or "", height=150)
                    save = st.form_submit_button("Save")
                    cancel = st.form_submit_button("Cancel")
                if save:
                    db.update_interaction(
                        interaction["id"],
                        date=new_date.isoformat() if new_date else None,
                        location=new_location,
                        appearance=new_appearance,
                        summary=new_summary,
                        raw_text=new_raw,
                    )
                    st.session_state[edit_key] = False
                    st.rerun()
                if cancel:
                    st.session_state[edit_key] = False
                    st.rerun()

    st.divider()
    st.subheader("Mentioned in")

    secondary_rows = db.get_secondary_interactions_for_person(selected_id)
    if not secondary_rows:
        st.caption("Not mentioned as a secondary person in any other notes yet.")
    else:
        secondary_sorted = sorted(
            secondary_rows, key=lambda r: (r.get("interaction") or {}).get("date") or ""
        )
        for row in secondary_sorted:
            mention_interaction = row.get("interaction") or {}
            primary_person = mention_interaction.get("person") or {}
            relation = row.get("relation")
            header = (
                f"{mention_interaction.get('date') or 'unknown date'} — "
                f"mentioned in a note about {primary_person.get('name', 'someone')}"
            )
            with st.expander(header):
                if relation:
                    st.caption(f"Relation: {relation}")
                if mention_interaction.get("summary"):
                    st.write(mention_interaction["summary"])

    st.divider()
    st.subheader("Merge or delete this person")

    other_options = {
        _person_label(p): p["id"] for p in people_sorted if p["id"] != selected_id
    }
    if other_options:
        merge_target_label = st.selectbox("Merge this person into...", list(other_options.keys()))
        if st.button("Merge"):
            confirm_merge_dialog(selected_id, person["name"], other_options[merge_target_label])
    else:
        st.caption("No other people to merge into yet.")

    if st.button("Delete this person", type="secondary"):
        confirm_delete_person_dialog(selected_id, person["name"])
