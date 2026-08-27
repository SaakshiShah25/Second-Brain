"""
email_client.py — Sends the daily morning-brief email via plain SMTP.
Defaults to Gmail (smtp.gmail.com with an account App Password), but
works with any SMTP provider by changing the env vars - a thin
stdlib-only wrapper (smtplib/email), same shape as llm_client.py's
get_client()-with-a-helpful-error pattern, rather than pulling in a
dedicated email-API SDK for one feature.

Setup (Gmail):
    1. Turn on 2-Step Verification on the Google account that will send
       these emails: https://myaccount.google.com/security
    2. Create an App Password: https://myaccount.google.com/apppasswords
       (choose "Mail" as the app) - a 16-character password, NOT the
       regular Gmail account password.
    3. Set env vars:
        export SMTP_HOST="smtp.gmail.com"
        export SMTP_PORT="587"
        export SMTP_USER="you@gmail.com"
        export SMTP_PASSWORD="<the 16-character app password>"
        export SMTP_FROM="you@gmail.com"          # optional, defaults to SMTP_USER
"""

import html
import os
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional


class NotConfiguredError(Exception):
    """Raised when the SMTP env vars aren't all set - lets callers fail
    with a clear, actionable error instead of a raw connection failure."""


def _get_config():
    host = os.environ.get("SMTP_HOST")
    port = os.environ.get("SMTP_PORT")
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    if not all([host, port, user, password]):
        raise NotConfiguredError(
            "SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD aren't all set - see email_client.py's docstring."
        )
    from_addr = os.environ.get("SMTP_FROM", user)
    return host, int(port), user, password, from_addr


def send_email(to_address: str, subject: str, body_text: str, body_html: Optional[str] = None) -> None:
    host, port, user, password, from_addr = _get_config()

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = from_addr
    message["To"] = to_address
    # The plain-text part must come first and the HTML part last - mail
    # clients render the LAST alternative part they understand, so this
    # order makes HTML-capable clients (nearly everyone) show the
    # formatted version while plain-text-only clients still get something
    # readable instead of nothing.
    message.attach(MIMEText(body_text, "plain"))
    if body_html:
        message.attach(MIMEText(body_html, "html"))

    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.sendmail(from_addr, [to_address], message.as_string())


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
