"""
email_client.py — Sends the admin alert and daily-report emails via Resend's
HTTP API (https://resend.com), not SMTP.

Why not SMTP: Render's free tier blocks outbound connections on the SMTP
ports (25/465/587) that smtplib needs - a common anti-abuse restriction
on free hosting tiers, not something specific to this app. This was
silently breaking every email in production. Resend
(like every other transactional-email provider - SendGrid, Postmark,
Mailgun, Brevo) sends over plain HTTPS instead, which Render's free tier
does allow, so switching providers rather than switching hosts is the
actual fix. Resend specifically has a generous free tier (3,000 emails/
month, 100/day) and the simplest API of the bunch for a single POST like
this - swap providers again later if that ever needs to change, nothing
above this file (observability.py, api/routers/admin.py) needs to know
which one is in use.

Setup:
    1. Create a free account at https://resend.com
    2. Verify a sending domain (Resend > Domains > Add Domain, then add
       the DNS records it gives you at your domain registrar) - this is
       only needed to email people other than yourself: without a verified
       domain, Resend's sandbox sender (onboarding@resend.dev) can only
       deliver to the email address YOUR Resend account is registered
       under - which is all the admin alerts and daily report need. Takes a few minutes to
       verify once the DNS records are added.
    3. Create an API key: Resend > API Keys > Create API Key
    4. Set env vars:
        export RESEND_API_KEY="re_..."
        export RESEND_FROM_EMAIL="alerts@yourdomain.com"   # must be on the verified domain above
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
    # Without a verified domain, Resend's shared test sender still delivers -
    # but only to the address the Resend account is registered under. That's
    # enough for admin alerts (observability.py); emails to anyone else
    # need RESEND_FROM_EMAIL on a verified domain.
    from_addr = os.environ.get("RESEND_FROM_EMAIL") or "MyConfía <onboarding@resend.dev>"
    if not api_key:
        raise NotConfiguredError("RESEND_API_KEY isn't set - see email_client.py's docstring.")
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
