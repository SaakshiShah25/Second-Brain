"""
api/routers/mcp_oauth.py - signing in for Claude ("Connect MyConfía to Claude").

Claude connects to the MCP server at /mcp the way any connector does: OAuth 2.1 with PKCE and dynamic client
registration. This backend is its authorization server, but it never asks for a password itself - the person approves
on the MyConfía site, where they are already signed in (Google or email), so there is nothing new to phish.

  GET  /.well-known/oauth-protected-resource[/mcp]   what /mcp is and who to ask for a token (RFC 9728)
  GET  /.well-known/oauth-authorization-server       where the endpoints below are (RFC 8414)
  POST /mcp/oauth/register     Claude registers itself (RFC 7591); nothing is trusted until a person approves
  GET  /mcp/oauth/authorize    Claude sends the person here; they are redirected to <site>/connect-claude
  GET  /mcp/oauth/request      what the consent page shows ("Claude wants to ...")
  POST /mcp/oauth/approve      the signed-in person says Allow / Cancel; answers with where to send the browser back
  POST /mcp/oauth/token        Claude trades the one-time code (or a refresh token) for tokens

All state is carried in signed tokens (mcp_tokens.py), so nothing is stored. See docs/MCP.md.
"""

import os
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

import mcp_tokens as tokens
from api.auth import get_current_user_id

# Two routers: the discovery documents live at the root of the host (that is where clients look), everything else
# under /mcp/oauth so "all the endpoints are under /mcp".
well_known = APIRouter()
router = APIRouter()

NO_STORE = {"Cache-Control": "no-store", "Pragma": "no-cache"}


def base_url(request: Request) -> str:
    """The public address of this backend (PUBLIC_BASE_URL, else the address the request came in on)."""
    return (os.environ.get("PUBLIC_BASE_URL") or str(request.base_url)).rstrip("/")


def frontend_url() -> str:
    return (os.environ.get("FRONTEND_URL", "").split(",")[0] or "").strip().rstrip("/")


def _require_enabled():
    if not tokens.enabled():
        raise HTTPException(404, "Claude connection isn't set up on this server.")


def _oauth_error(error: str, description: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": error, "error_description": description}, status_code=status, headers=NO_STORE)


# ---------- discovery ----------

@well_known.get("/.well-known/oauth-protected-resource")
@well_known.get("/.well-known/oauth-protected-resource/mcp")
def protected_resource(request: Request):
    _require_enabled()
    base = base_url(request)
    return {
        "resource": f"{base}/mcp",
        "authorization_servers": [base],
        "bearer_methods_supported": ["header"],
        "scopes_supported": [tokens.SCOPE],
        "resource_name": "MyConfía",
    }


@well_known.get("/.well-known/oauth-authorization-server")
@well_known.get("/.well-known/oauth-authorization-server/mcp")
def authorization_server(request: Request):
    _require_enabled()
    base = base_url(request)
    return {
        "issuer": base,
        "authorization_endpoint": f"{base}/mcp/oauth/authorize",
        "token_endpoint": f"{base}/mcp/oauth/token",
        "registration_endpoint": f"{base}/mcp/oauth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": [tokens.SCOPE],
    }


# ---------- registration ----------

def _valid_redirect(uri: str) -> bool:
    """https anywhere, or plain http only for a program on the same computer (RFC 8252); never a fragment."""
    try:
        u = urlparse(uri)
    except ValueError:
        return False
    if u.fragment or not u.netloc:
        return False
    if u.scheme == "https":
        return True
    return u.scheme == "http" and u.hostname in ("localhost", "127.0.0.1", "::1")


class RegisterRequest(BaseModel):
    redirect_uris: list[str] = Field(..., min_length=1, max_length=10)
    client_name: str = Field("Claude", max_length=100)


@router.post("/register", status_code=201)
def register(body: RegisterRequest):
    _require_enabled()
    uris = [u.strip() for u in body.redirect_uris]
    if not all(_valid_redirect(u) and len(u) <= 500 for u in uris):
        return _oauth_error("invalid_redirect_uri", "Redirect addresses must be https (or http on localhost).")
    name = " ".join(body.client_name.split())[:100] or "Claude"
    client_id = tokens.sign({"typ": "mcp-client", "redirect_uris": uris, "name": name}, tokens.CLIENT_TTL)
    return JSONResponse(
        {
            "client_id": client_id,
            "client_name": name,
            "redirect_uris": uris,
            "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "scope": tokens.SCOPE,
        },
        status_code=201,
        headers=NO_STORE,
    )


# ---------- authorize -> consent page ----------

@router.get("/authorize")
def authorize(
    request: Request,
    response_type: str = "",
    client_id: str = "",
    redirect_uri: str = "",
    code_challenge: str = "",
    code_challenge_method: str = "",
    state: str = "",
    scope: str = "",
):
    _require_enabled()
    client = tokens.verify(client_id, "mcp-client")
    # Anything wrong with who is asking or where to send the answer is shown, never redirected (RFC 6749 4.1.2.1).
    if not client:
        raise HTTPException(400, "Unknown client - connect again from Claude.")
    if redirect_uri not in client["redirect_uris"]:
        raise HTTPException(400, "That redirect address wasn't registered for this client.")
    if response_type != "code":
        return RedirectResponse(_back(redirect_uri, state, error="unsupported_response_type"), status_code=302)
    if not code_challenge or code_challenge_method != "S256":
        return RedirectResponse(_back(redirect_uri, state, error="invalid_request", description="PKCE (S256) is required"), status_code=302)
    site = frontend_url()
    if not site:
        raise HTTPException(500, "FRONTEND_URL isn't set on the server.")
    req = tokens.sign(
        {"typ": "mcp-request", "client_id": client_id, "name": client["name"], "redirect_uri": redirect_uri,
         "challenge": code_challenge, "state": state},
        tokens.REQUEST_TTL,
    )
    return RedirectResponse(f"{site}/connect-claude?{urlencode({'request': req})}", status_code=302)


def _back(redirect_uri: str, state: str, **params) -> str:
    query = {k: v for k, v in {**params, "state": state}.items() if v}
    return redirect_uri + ("&" if "?" in redirect_uri else "?") + urlencode(query)


@router.get("/request")
def request_info(request: str):
    """What the consent page needs to say who is asking. Public: it only echoes the name Claude registered with and
    where the answer will go, both inside a signed, 10-minute token."""
    _require_enabled()
    req = tokens.verify(request, "mcp-request")
    if not req:
        raise HTTPException(400, "This sign-in request has expired - start again from Claude.")
    return {"client_name": req["name"], "redirect_host": urlparse(req["redirect_uri"]).netloc}


class ApproveRequest(BaseModel):
    request: str = Field(..., max_length=4000)
    approve: bool = True


@router.post("/approve")
def approve(body: ApproveRequest, user_id: str = Depends(get_current_user_id)):
    """The signed-in person's answer. Sends back the address to take the browser to (Claude's callback)."""
    _require_enabled()
    req = tokens.verify(body.request, "mcp-request")
    if not req:
        raise HTTPException(400, "This sign-in request has expired - start again from Claude.")
    if not body.approve:
        return {"redirect": _back(req["redirect_uri"], req["state"], error="access_denied", description="The user declined")}
    code = tokens.sign(
        {"typ": "mcp-code", "sub": user_id, "client_id": req["client_id"], "redirect_uri": req["redirect_uri"],
         "challenge": req["challenge"], "jti": tokens.new_id()},
        tokens.CODE_TTL,
    )
    return {"redirect": _back(req["redirect_uri"], req["state"], code=code)}


# ---------- token ----------

def _issue(request: Request, user_id: str, client_id: str) -> JSONResponse:
    base = base_url(request)
    access = tokens.sign({"typ": "mcp-access", "sub": user_id, "client_id": client_id, "aud": f"{base}/mcp", "scope": tokens.SCOPE}, tokens.ACCESS_TTL)
    refresh = tokens.sign({"typ": "mcp-refresh", "sub": user_id, "client_id": client_id, "jti": tokens.new_id()}, tokens.REFRESH_TTL)
    return JSONResponse(
        {"access_token": access, "token_type": "Bearer", "expires_in": tokens.ACCESS_TTL, "refresh_token": refresh, "scope": tokens.SCOPE},
        headers=NO_STORE,
    )


@router.post("/token")
def token(
    request: Request,
    grant_type: str = Form(""),
    code: str = Form(""),
    redirect_uri: str = Form(""),
    client_id: str = Form(""),
    code_verifier: str = Form(""),
    refresh_token: str = Form(""),
):
    _require_enabled()
    if grant_type == "authorization_code":
        grant = tokens.verify(code, "mcp-code")
        if not grant or not client_id or grant["client_id"] != client_id:
            return _oauth_error("invalid_grant", "That code is invalid or has expired.")
        if redirect_uri and redirect_uri != grant["redirect_uri"]:
            return _oauth_error("invalid_grant", "redirect_uri doesn't match the request.")
        if not code_verifier or tokens.pkce_challenge(code_verifier) != grant["challenge"]:
            return _oauth_error("invalid_grant", "PKCE verification failed.")
        if not tokens.use_once(grant["jti"], tokens.CODE_TTL):
            return _oauth_error("invalid_grant", "That code was already used.")
        return _issue(request, grant["sub"], grant["client_id"])
    if grant_type == "refresh_token":
        old = tokens.verify(refresh_token, "mcp-refresh")
        if not old or (client_id and old["client_id"] != client_id):
            return _oauth_error("invalid_grant", "That refresh token is invalid or has expired.")
        if not tokens.use_once(old["jti"], tokens.REFRESH_TTL):
            return _oauth_error("invalid_grant", "That refresh token was already used.")
        return _issue(request, old["sub"], old["client_id"])
    return _oauth_error("unsupported_grant_type", "Use authorization_code or refresh_token.")
