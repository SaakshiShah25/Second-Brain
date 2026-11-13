# MyConfía in Claude (MCP server)

MyConfía runs a [Model Context Protocol](https://modelcontextprotocol.io) server at **`<backend>/mcp`**. Add that address
to Claude as a custom connector and everything MyConfía does is available from the chat: see Today, add and tick to-dos,
set due dates and reminders, browse spaces, lists and notes, capture what you say, and ask questions of your notes.
Claude draws interactive screens (an "MCP App") for the things it shows - Today, a to-do with its due date and
reminder, spaces, what a capture saved, and an answer with its sources.

## Turn it on (once)

1. Run **`scripts/migration_48_mcp_revoke.sql`** in the Supabase SQL editor (makes "Disconnect" work).
2. On Render, set **`MCP_TOKEN_SECRET`** to a long random value:
   `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Without it `/mcp` answers 404 (off).
   `FRONTEND_URL` must already be set (the approval page lives on the website).
   If the backend sits behind a custom domain, also set `PUBLIC_BASE_URL` to its public address.
3. Deploy the backend and the website.

## Connect Claude

In Claude: **Settings → Connectors → Add custom connector**, name it MyConfía and paste
`https://<your-backend>/mcp` (Settings → "Use MyConfía in Claude" in the app shows and copies the address).
Claude sends you to the MyConfía site: sign in as usual (Google or email) and press **Allow**. Done.

Claude Code or other clients that take a header can skip the sign-in with a normal session token:
`claude mcp add --transport http confia https://<backend>/mcp --header "Authorization: Bearer <access token>"`.

## How the sign-in works (and why it is safe)

OAuth 2.1 with PKCE and dynamic client registration, the standard for connectors:

| Step | Endpoint |
|---|---|
| Claude learns where to sign in | `GET /.well-known/oauth-protected-resource[/mcp]`, `GET /.well-known/oauth-authorization-server` |
| Claude registers itself | `POST /mcp/oauth/register` (only https redirect addresses, or http on localhost) |
| Claude sends you to sign in | `GET /mcp/oauth/authorize` → the website's `/connect-claude` page |
| You say Allow / Cancel | `POST /mcp/oauth/approve` (needs your normal MyConfía login) |
| Claude trades the one-time code | `POST /mcp/oauth/token` (code + PKCE verifier, or a refresh token) |
| You cut Claude off | `POST /mcp/oauth/disconnect` (Settings → Disconnect Claude) |

* **No new password.** Approval happens on the MyConfía site, where you are already signed in; the backend never sees a password.
* **Nothing is stored.** Clients, codes and tokens are signed (HS256, `MCP_TOKEN_SECRET`). Access tokens last 1 hour, refresh tokens 60 days (each usable once), one-time codes 2 minutes.
* **Bound tokens.** A code only works for the client and redirect address it was issued to, and only with the PKCE secret; an access token only works at this server (`aud`).
* **Same rules as the app.** The invite list (`ALLOWED_EMAILS`) is checked on every connection; the monthly AI limits apply to capture and questions; deleting anything needs an explicit `confirm`.
* **Disconnect really disconnects.** It stamps the account; every token issued before then stops working immediately and cannot be refreshed. Rotating `MCP_TOKEN_SECRET` signs everybody out of Claude at once.

## The tools

Reading: `show_today`, `list_tasks`, `show_task`, `list_spaces`, `open_space`, `list_notes`, `ask_confia`
Writing: `add_task`, `update_task`, `complete_task`, `capture`, `add_note`, `update_note`, `create_space`, `rename_space`, `create_list`, `add_list_item`
Deleting (need `confirm: true`): `delete_task`, `delete_note`, `delete_list`, `delete_space`

A reminder always comes **before** the due date: `remind_before_minutes` (e.g. 10, 60, 1440) or a `remind_at` no later than the due moment - the same rule the app and the server enforce.

## Where the code is

* `api/routers/mcp.py` - the `/mcp` endpoint, auth, invite and disconnect checks
* `api/routers/mcp_oauth.py` - discovery, registration, approval, tokens, disconnect
* `mcp_server.py` - the JSON-RPC protocol (`initialize`, `tools/*`, `resources/*`, `prompts/*`), stateless
* `mcp_tools.py` - every tool, built on the app's own route functions
* `mcp_ui.py` - the interactive screens (one small web app, `ui://confia/...`)
* `mcp_tokens.py` - the signed tokens
* `frontend/src/pages/ConnectClaudePage.tsx`, `components/ClaudeSettings.tsx` - the approval page and the Settings controls

Tests: `python -m pytest tests/test_mcp.py`.
