"""
api/routers/reports.py - lets a user flag an AI-generated reply as wrong,
offensive, or irrelevant. Google Play's AI-Generated Content policy
requires apps that generate content with AI to give users an in-app way
to report it; this is that, and it also doubles as the only real feedback
loop on answer quality the app has (everything else about quality is
checked by hand during development).

Reports are stored encrypted (db.create_report) and reviewed by the
maintainer via db.list_reports() - deliberately no endpoint reads them
back out, since they quote the reporting user's private notes.
"""

from fastapi import APIRouter, Depends, HTTPException, Request

import db
from api.auth import get_current_user_id
from api.rate_limit import limiter
from api.schemas import ReportCreate

router = APIRouter()


@router.post("")
@limiter.limit("10/minute")
def create_report(request: Request, body: ReportCreate, user_id: str = Depends(get_current_user_id)):
    if not body.answer.strip():
        raise HTTPException(400, "Nothing to report.")
    try:
        report_id = db.create_report(
            user_id,
            kind=body.kind,
            reason=body.reason,
            question=body.question,
            answer=body.answer,
            details=body.details,
            source_interaction_ids=body.source_interaction_ids,
        )
    except Exception as e:
        # NOT failing open like entitlements/moderation do: the user is
        # explicitly telling us something went wrong, and silently
        # pretending the report was received when it wasn't (e.g. the
        # ai_report table hasn't been migrated yet) is worse than saying so.
        print(f"[error] Couldn't save an AI report for user={user_id}: {e}")
        raise HTTPException(503, "Couldn't send your report right now - please try again in a moment.")
    return {"ok": True, "id": report_id}
