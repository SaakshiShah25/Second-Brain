"""
api/routers/mcp.py - the MCP endpoint: POST /mcp (see mcp_server.py), the front door for "Connect MyConfía to Claude".

Who is calling is settled here, before any tool runs:
  * a MyConfía access token that Claude got by signing in through api/routers/mcp_oauth.py, or
  * a normal MyConfía (Supabase) session token - handy for Claude Code and testing:
        claude mcp add --transport http confia https://<backend>/mcp --header "Authorization: Bearer <token>"
Anything else gets 401 with a pointer to the sign-in details, which is how Claude knows to start the OAuth flow.
"""

import json
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response

import db
import mcp_server
import mcp_tokens as tokens
from api.auth import get_current_user_id, is_invited
from api.routers.mcp_oauth import base_url

router = APIRouter()

MAX_BODY = 200_000


def _unauthorized(request: Request, bad_token: bool) -> JSONResponse:
    meta = f"{base_url(request)}/.well-known/oauth-protected-resource/mcp"
    header = f'Bearer resource_metadata="{meta}"' + (', error="invalid_token"' if bad_token else "")
    return JSONResponse({"error": "invalid_token" if bad_token else "unauthorized", "error_description": "Sign in to MyConfía to use this."},
                        status_code=401, headers={"WWW-Authenticate": header})


# Whether an account is still allowed in (ALLOWED_EMAILS), remembered for a few minutes so a token isn't a network
# round trip on every call. A person removed from the list loses access to Claude within this time.
_invited: dict = {}
INVITE_CACHE_SECONDS = 300


def _still_invited(user_id: str) -> bool:
    hit = _invited.get(user_id)
    if hit and time.time() - hit[1] < INVITE_CACHE_SECONDS:
        return hit[0]
    try:
        ok = is_invited(db.get_user_email(user_id))
    except Exception:  # noqa: BLE001 - can't check right now: don't lock a signed-in person out for it
        return True
    _invited[user_id] = (ok, time.time())
    return ok


def _user_for(request: Request):
    """(user_id, None) or (None, the 401/403 response)."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None, _unauthorized(request, bad_token=False)
    token = auth[7:].strip()
    claims = tokens.verify(token, "mcp-access")
    if claims:
        if claims.get("aud") != f"{base_url(request)}/mcp":
            return None, _unauthorized(request, bad_token=True)  # a token meant for some other server
        if not _still_invited(claims["sub"]):
            return None, JSONResponse({"error": "forbidden", "error_description": "This account isn't on the MyConfía invite list."}, status_code=403)
        return claims["sub"], None
    try:  # a plain MyConfía session token
        return get_current_user_id(f"Bearer {token}"), None
    except HTTPException as e:
        if e.status_code == 401:
            return None, _unauthorized(request, bad_token=True)
        return None, JSONResponse({"error": "forbidden" if e.status_code == 403 else "unavailable", "error_description": str(e.detail)}, status_code=e.status_code)


@router.post("")
async def mcp_post(request: Request):
    if not tokens.enabled():
        raise HTTPException(404, "Claude connection isn't set up on this server.")
    user_id, problem = _user_for(request)
    if problem is not None:
        return problem
    raw = await request.body()
    if len(raw) > MAX_BODY:
        return JSONResponse({"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Request too large"}}, status_code=413)
    try:
        payload = json.loads(raw)
    except ValueError:
        return JSONResponse({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}, status_code=400)
    if isinstance(payload, list):  # a batch
        answers = [a for a in [await mcp_server.handle(m, user_id) for m in payload[:20]] if a is not None]
        return JSONResponse(answers) if answers else Response(status_code=202)
    answer = await mcp_server.handle(payload, user_id)
    return JSONResponse(answer) if answer is not None else Response(status_code=202)


@router.get("")
@router.delete("")
async def mcp_other():
    """This server doesn't push messages or keep sessions; the spec allows saying so."""
    return Response(status_code=405, headers={"Allow": "POST"})
