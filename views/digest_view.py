"""
views/digest_view.py — The "Digest" page: the app's default landing page,
and the only place task follow-ups are managed (folded in from what used
to be a separate Tasks page - they were showing overlapping data with
different framing, so one page with one unified filter is simpler).

Surfaces what needs attention without having to ask - every task in one
place with an Overdue/Due soon/Open/Done/All filter (all actionable, same
mark-done/reopen everywhere), plus relationships that have gone quiet
(db.get_people_with_last_interaction()). "Get briefing" for a specific
person lives on the People page only, not here - this page is for
scanning across everyone, not going deep on one person.
"""

from datetime import date, datetime, timedelta

import streamlit as st

import db

FILTERS = ["Overdue", "Due soon", "Open", "Done", "All"]


def _due_label(task: dict) -> str:
    due = task.get("due_date")
    if not due:
        return "no due date"
    if task.get("status") == "open" and due < date.today().isoformat():
        return f"⚠️ overdue ({due})"
    return f"due {due}"


def _matches_filter(task: dict, filter_name: str, today_str: str, soon_cutoff_str: str) -> bool:
    due = task.get("due_date")
    status = task.get("status")
    if filter_name == "Overdue":
        return status == "open" and bool(due) and due < today_str
    if filter_name == "Due soon":
        return status == "open" and bool(due) and today_str <= due <= soon_cutoff_str
    if filter_name == "Open":
        return status == "open"
    if filter_name == "Done":
        return status == "done"
    return True  # "All"


def _days_ago(date_str: str) -> int:
    return (date.today() - datetime.fromisoformat(date_str).date()).days


def render():
    st.title("🌅 Digest")

    try:
        all_tasks = db.get_all_tasks_with_context()
    except Exception as e:
        st.error(f"Couldn't load digest: {e}")
        return

    today_str = date.today().isoformat()
    soon_cutoff_str = (date.today() + timedelta(days=7)).isoformat()

    overdue_count = sum(1 for t in all_tasks if _matches_filter(t, "Overdue", today_str, soon_cutoff_str))
    due_soon_count = sum(1 for t in all_tasks if _matches_filter(t, "Due soon", today_str, soon_cutoff_str))
    open_count = sum(1 for t in all_tasks if t["status"] == "open")
    done_count = sum(1 for t in all_tasks if t["status"] == "done")

    st.subheader("Tasks")
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Overdue", overdue_count)
    col2.metric("Due in 7 days", due_soon_count)
    col3.metric("Open", open_count)
    col4.metric("Done", done_count)

    filter_name = st.radio("Show", FILTERS, index=2, horizontal=True)
    tasks = [t for t in all_tasks if _matches_filter(t, filter_name, today_str, soon_cutoff_str)]

    if not tasks:
        st.caption("Nothing here.")
    else:
        for task in tasks:
            interaction = task.get("interaction") or {}
            person = (interaction.get("person") or {}) if interaction else {}
            person_name = person.get("name", "Unknown")

            with st.container(border=True):
                cols = st.columns([5, 2, 1])
                with cols[0]:
                    st.markdown(f"**{task['description']}**")
                    st.caption(person_name + (f" · {interaction['date']}" if interaction.get("date") else ""))
                with cols[1]:
                    label = _due_label(task)
                    if label.startswith("⚠️"):
                        st.markdown(f":red[{label}]")
                    else:
                        st.caption(label)
                with cols[2]:
                    if task["status"] == "open":
                        if st.button("Mark done", key=f"done_{task['id']}"):
                            db.update_task_status(task["id"], "done")
                            st.rerun()
                    else:
                        if st.button("Reopen", key=f"reopen_{task['id']}"):
                            db.update_task_status(task["id"], "open")
                            st.rerun()

    st.divider()
    st.subheader("Relationships gone quiet")
    st.caption("Open their profile on the People page for a full \"Get briefing\".")

    threshold = st.slider("Flag people not contacted in the last (days)", 7, 180, 30)

    try:
        people = db.get_people_with_last_interaction()
    except Exception as e:
        st.error(f"Couldn't load relationships: {e}")
        return

    stale = sorted(
        (p for p in people
         if p.get("last_interaction_date") and _days_ago(p["last_interaction_date"]) >= threshold),
        key=lambda p: p["last_interaction_date"],
    )

    if not stale:
        st.caption("No relationships have gone quiet by that threshold.")
    else:
        for p in stale:
            days = _days_ago(p["last_interaction_date"])
            role_company = ", ".join(b for b in [p.get("role"), p.get("company")] if b)
            st.markdown(
                f"**{p['name']}**" + (f" — {role_company}" if role_company else "")
                + f"  \n:gray[Last talked {p['last_interaction_date']} ({days} days ago)]"
            )
