"""
email_client.py — Sends the daily morning-brief email via Resend's HTTP
API (https://resend.com), not SMTP.

Why not SMTP: Render's free tier blocks outbound connections on the SMTP
ports (25/465/587) that smtplib needs - a common anti-abuse restriction
on free hosting tiers, not something specific to this app. This was
silently breaking the daily brief for every user in production. Resend
(like every other transactional-email provider - SendGrid, Postmark,
Mailgun, Brevo) sends over plain HTTPS instead, which Render's free tier
does allow, so switching providers rather than switching hosts is the
actual fix. Resend specifically has a generous free tier (3,000 emails/
month, 100/day) and the simplest API of the bunch for a single POST like
this - swap providers again later if that ever needs to change, nothing
above this file (api/routers/brief.py, morning_brief.py) needs to know
which one is in use.

Setup:
    1. Create a free account at https://resend.com
    2. Verify a sending domain (Resend > Domains > Add Domain, then add
       the DNS records it gives you at your domain registrar) - this is
       NOT optional for this feature to actually reach real users: without
       a verified domain, Resend's sandbox sender (onboarding@resend.dev)
       can only deliver to the email address YOUR Resend account is
       registered under, not to your actual users. Takes a few minutes to
       verify once the DNS records are added.
    3. Create an API key: Resend > API Keys > Create API Key
    4. Set env vars:
        export RESEND_API_KEY="re_..."
        export RESEND_FROM_EMAIL="brief@yourdomain.com"   # must be on the verified domain above
"""

import html
import os
import re
from typing import Optional

import requests

_RESEND_API_URL = "https://api.resend.com/emails"


class NotConfiguredError(Exception):
    """Raised when the Resend env vars aren't set - lets callers fail
    with a clear, actionable error instead of a raw request failure."""


def _get_config():
    api_key = os.environ.get("RESEND_API_KEY")
    from_addr = os.environ.get("RESEND_FROM_EMAIL")
    if not api_key or not from_addr:
        raise NotConfiguredError(
            "RESEND_API_KEY/RESEND_FROM_EMAIL aren't both set - see email_client.py's docstring."
        )
    return api_key, from_addr


def send_email(to_address: str, subject: str, body_text: str, body_html: Optional[str] = None) -> None:
    api_key, from_addr = _get_config()
    payload = {"from": from_addr, "to": [to_address], "subject": subject, "text": body_text}
    if body_html:
        payload["html"] = body_html

    response = requests.post(
        _RESEND_API_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=15,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Resend API returned {response.status_code}: {response.text}")


def _inline_markdown_to_html(text: str) -> str:
    """Escapes HTML special chars, then turns **bold** into <strong>."""
    escaped = html.escape(text)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)


def _markdown_to_html(text: str) -> str:
    """Converts the narrow markdown subset the brief LLM actually
    produces - paragraphs, **bold**, and "- " bullet lists - to HTML.
    Same scope as the frontend's prose-chat CSS handles for chat
    messages; not a general markdown parser.

    Classifies line by line (a bold "header" line like "**Today's
    tasks**" is immediately followed by its bullet list with no blank
    line between them in practice) rather than splitting on blank lines
    first - a blank-line block split would lump that header in with the
    list as one broken paragraph and lose the list structure entirely."""
    html_blocks = []
    paragraph_lines: list = []
    list_items: list = []

    def flush_paragraph():
        if paragraph_lines:
            text = " ".join(paragraph_lines)
            html_blocks.append(f'<p style="margin:0 0 16px;">{_inline_markdown_to_html(text)}</p>')
            paragraph_lines.clear()

    def flush_list():
        if list_items:
            items = "".join(f"<li>{_inline_markdown_to_html(item)}</li>" for item in list_items)
            html_blocks.append(f'<ul style="margin:0 0 16px;padding-left:20px;">{items}</ul>')
            list_items.clear()

    for raw_line in text.strip().splitlines():
        line = raw_line.strip()
        if not line:
            flush_paragraph()
            flush_list()
        elif line.startswith(("- ", "* ")):
            flush_paragraph()
            list_items.append(line[2:])
        else:
            flush_list()
            paragraph_lines.append(line)

    flush_paragraph()
    flush_list()
    return "".join(html_blocks)


def send_markdown_email(to_address: str, subject: str, body_markdown: str) -> None:
    """Sends `body_markdown` as a real formatted HTML email (bold/bullets
    actually render, instead of literal ** and - characters), with the
    raw markdown as the plain-text fallback for clients that don't
    render HTML."""
    body_html = f"""<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#1d1d1f; max-width:600px; margin:0 auto; padding:24px;">
    <h2 style="margin:0 0 16px; font-size:20px;">{html.escape(subject)}</h2>
    {_markdown_to_html(body_markdown)}
  </body>
</html>"""
    send_email(to_address, subject, body_markdown, body_html=body_html)
