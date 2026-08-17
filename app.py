"""
app.py — Entry point for the Second Brain Streamlit app.

A thin router: sets up the page and hands off to one of three pages, each
implemented in views/ and reusing the same underlying building blocks
(db.py, extraction.py, retrieval.py, etc.):
  - Digest  (views/digest_view.py)  — the default landing page. Every task
                                       (Overdue/Due soon/Open/Done/All
                                       filter, mark-done everywhere) plus
                                       relationships that have gone quiet.
  - Chat    (views/chat_view.py)    — log a note, ask a question, or scan
                                       a business card; typing or voice.
  - People  (views/people_view.py)  — browse a person's timeline, fix
                                       mistakes, merge duplicate entries,
                                       and pull up a "Get briefing" for
                                       them specifically.

Run with:
    streamlit run app.py
"""

from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

import streamlit as st

from views import chat_view, people_view, digest_view

st.set_page_config(page_title="Second Brain", page_icon="🧠", layout="centered")

# Custom theme (assets/style.css) - applies to every page since this
# entry script fully re-executes on every navigation. Complements
# .streamlit/config.toml, which handles Streamlit's own built-in widget
# theming; this file covers everything config.toml can't reach (fonts,
# hiding Streamlit chrome, cards, the sidebar nav, radio-as-pills).
_css_path = Path(__file__).parent / "assets" / "style.css"
st.markdown(f"<style>{_css_path.read_text()}</style>", unsafe_allow_html=True)

pages = [
    st.Page(digest_view.render, title="Digest", icon="🌅", url_path="digest", default=True),
    st.Page(chat_view.render, title="Chat", icon="💬", url_path="chat"),
    st.Page(people_view.render, title="People", icon="🧑‍🤝‍🧑", url_path="people"),
]

st.navigation(pages).run()
