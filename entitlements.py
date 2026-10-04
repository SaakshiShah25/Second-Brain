"""
entitlements.py — Free vs premium gating.

Everything a caller needs is two functions:

    entitlements.get_tier(user_id)                        -> "free" | "premium"
    entitlements.check_and_increment(user_id, "resource")  -> raises if the
                                                               free-tier cap
                                                               for this month
                                                               is already hit,
                                                               otherwise counts
                                                               this use and
                                                               returns normally

Premium accounts never hit a cap (see FREE_LIMITS below - a resource with
no configured limit is unlimited for everyone, and check_and_increment
skips the check entirely once get_tier() says "premium"). This module
only decides WHETHER an action is allowed - it never processes a
payment; that's api/routers/billing.py's job (Stripe Checkout + webhook),
which is what actually writes the `subscription` table this reads.

FREE_LIMITS is intentionally a plain module-level dict of placeholder
numbers, not something loaded from a config service - there's no pricing
model finalized yet, so these are meant to be edited directly here once
real tier boundaries are decided (see the PR/commit that added this file
for the open product-decision this was left at).
"""

from datetime import date

import db

# Monthly caps for free-tier accounts. A resource name not listed here
# has no cap at all (e.g. reading your own notes/people is never
# metered - only the LLM-calling actions that cost real money against
# Groq/Cohere's free-tier quota are). Numbers below are placeholders -
# pick real ones based on actual per-user Groq/Cohere free-tier cost
# once that's measured, not guessed here.
FREE_LIMITS = {
    "interactions_logged": 50,   # notes/interactions captured per month
    "ai_questions_asked": 30,    # chat "ask" queries per month
    "voice_transcriptions": 30,  # voice notes per month (Whisper minutes)
    "card_scans": 10,            # business card scans per month
}


class LimitExceeded(Exception):
    """Raised by check_and_increment() when a free-tier account has hit
    this month's cap for a metered resource. Callers (api/routers/*.py)
    should catch this and return a 402/403 with an upgrade prompt, not a
    generic 500."""

    def __init__(self, resource: str, limit: int):
        self.resource = resource
        self.limit = limit
        super().__init__(f"Free-tier monthly limit reached for '{resource}' ({limit}/month)")


def get_tier(user_id: str) -> str:
    """'premium' only while the subscription is both marked premium AND
    still within its paid-through period - so a canceled subscription
    keeps working until current_period_end (what the user already paid
    for), then quietly reverts to free on its own with no separate
    "expire" job needed to run anywhere."""
    sub = db.get_subscription(user_id)
    if sub.get("tier") != "premium":
        return "free"
    period_end = sub.get("current_period_end")
    if period_end and period_end < date.today().isoformat():
        return "free"
    return "premium"


def _current_period() -> str:
    return date.today().replace(day=1).isoformat()


def check_and_increment(user_id: str, resource: str) -> None:
    """Call this right before performing a metered action (logging a
    note, asking a question, transcribing voice, scanning a card).
    Premium accounts always pass through untouched - usage isn't even
    counted for them, since there's nothing to enforce. A resource with
    no entry in FREE_LIMITS is unmetered for everyone (raises never).
    Raises LimitExceeded if a free account has already used up this
    month's cap for `resource` - callers must catch this and stop before
    doing the expensive work (the LLM call), not after.

    Fails OPEN (lets the action through, uncounted) on any OTHER error -
    same graceful-degradation contract as moderation.py's check(): this
    reads/writes the `subscription`/`usage_counter` tables (schema.sql
    section 24), which is new and easy to deploy out of order relative to
    the migration that creates them, plus this whole mechanism is a
    monetization/cost-control layer, not a safety one - a transient
    Supabase hiccup or a not-yet-migrated database should degrade to
    "temporarily unmetered", never to "the entire app 500s on every
    capture/ask call"."""
    try:
        if get_tier(user_id) == "premium":
            return
        limit = FREE_LIMITS.get(resource)
        if limit is None:
            return
        period = _current_period()
        current = db.get_usage_count(user_id, resource, period)
        if current >= limit:
            raise LimitExceeded(resource, limit)
        db.increment_usage(user_id, resource, period)
    except LimitExceeded:
        raise
    except Exception as e:
        print(f"[warn] Entitlement check failed for user={user_id} resource={resource} ({e}). Failing open.")
