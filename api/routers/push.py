"""
api/routers/push.py — Task reminder push notifications (see push_notify.py).

  GET  /api/push/key        - the public VAPID key the browser needs to subscribe (404 when push
                              isn't configured on this server, so the app can hide the option)
  POST /api/push/subscribe  - register this device (its endpoint + keys + time zone); calling it
                              again just refreshes the time zone
  POST /api/push/unsubscribe
  POST /api/push/test       - send the current task list to the caller's own devices right now
  POST /api/push/send-due   - the scheduled job: sends every reminder that is due. There is no
                              logged-in user for a job, so it is protected by a shared secret
                              header (the same CRON_SECRET the workflow holds)
"""

import hmac
import os

from fastapi import APIRouter, Depends, Header, HTTPException

import db
import push_notify
from api.auth import get_current_user_id
import date_utils
from api.schemas import PushPrefsRequest, PushSubscribeRequest, PushUnsubscribeRequest

router = APIRouter()


def _require_configured():
    if not push_notify.configured():
        raise HTTPException(404, "Push notifications aren't set up on this server.")


@router.get("/key")
def get_key(user_id: str = Depends(get_current_user_id)):
    _require_configured()
    return {"public_key": push_notify.public_key()}


@router.post("/subscribe")
def subscribe(body: PushSubscribeRequest, user_id: str = Depends(get_current_user_id)):
    _require_configured()
    if not body.endpoint.startswith("https://"):
        raise HTTPException(400, "A push endpoint must be an https address.")
    zone = body.timezone if push_notify.valid_timezone(body.timezone) else "UTC"
    db.upsert_push_subscription(user_id, body.endpoint, body.keys.p256dh, body.keys.auth, zone)
    return {"ok": True, "timezone": zone}


@router.post("/unsubscribe")
def unsubscribe(body: PushUnsubscribeRequest, user_id: str = Depends(get_current_user_id)):
    db.delete_push_subscription(body.endpoint, user_id)
    return {"ok": True}


@router.get("/prefs")
def get_prefs(endpoint: str, user_id: str = Depends(get_current_user_id)):
    """This device's summary times and alarm choice (defaults until migration 46 has run)."""
    _require_configured()
    prefs = db.get_push_prefs(user_id, endpoint)
    if prefs is None:
        raise HTTPException(404, "This device isn't subscribed - turn reminders on first.")
    return prefs


@router.put("/prefs")
def put_prefs(body: PushPrefsRequest, user_id: str = Depends(get_current_user_id)):
    _require_configured()
    fields = {}
    for name in ("morning_time", "evening_time"):
        value = getattr(body, name)
        if value is not None:
            valid = date_utils.to_valid_time(value)
            if not valid:
                raise HTTPException(400, f"{name} must look like 07:30")
            fields[name] = valid[:5]
    for name in ("morning_on", "evening_on", "alarm_style"):
        value = getattr(body, name)
        if value is not None:
            fields[name] = value
    if not fields:
        return db.get_push_prefs(user_id, body.endpoint) or {}
    if not db.push_prefs_supported():
        raise HTTPException(503, "Choosing reminder times isn't available yet - run scripts/migration_46_reminder_prefs.sql first.")
    if db.get_push_prefs(user_id, body.endpoint) is None:
        raise HTTPException(404, "This device isn't subscribed - turn reminders on first.")
    db.set_push_prefs(user_id, body.endpoint, fields)
    return db.get_push_prefs(user_id, body.endpoint)


@router.post("/test")
def send_test(alarm: bool = False, user_id: str = Depends(get_current_user_id)):
    _require_configured()
    sent = push_notify.send_to_user(user_id, alarm=alarm)
    if sent == 0:
        raise HTTPException(409, "No device is subscribed yet - turn reminders on first.")
    return {"ok": True, "sent": sent}


@router.post("/send-due")
def send_due(x_cron_secret: str = Header(None)):
    expected = os.environ.get("CRON_SECRET")
    if not expected or not x_cron_secret or not hmac.compare_digest(x_cron_secret, expected):
        raise HTTPException(403, "Invalid or missing cron secret.")
    _require_configured()
    result = push_notify.send_due()
    result.update(push_notify.send_task_reminders())  # the bell on individual tasks
    return result
