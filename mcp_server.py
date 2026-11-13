"""
mcp_server.py - the Model Context Protocol server for MyConfía (HTTP route in api/routers/mcp.py).

A small, dependency-free JSON-RPC handler for MCP's "streamable HTTP" transport in its simplest, stateless form: every
POST carries one message (or a batch) and gets one JSON answer; nothing is remembered between calls. It answers

    initialize, ping, tools/list, tools/call, resources/list, resources/read, prompts/list, prompts/get

The tools are in mcp_tools.py. Tools that show something return a structured copy of their result and point at an
interactive view (mcp_ui.py, served as an `ui://confia/...` resource) - hosts that support MCP Apps, like Claude, draw
that view right in the conversation; any other client just reads the text.
"""

import json
from typing import Optional

import mcp_tools
import mcp_ui

SERVER_NAME = "MyConfía"
SERVER_VERSION = "1.0.0"
PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]
UI_MIME = "text/html;profile=mcp-app"
MAX_TEXT = 24_000

INSTRUCTIONS = (
    "MyConfía is the person's second brain: notes, to-dos with due dates and reminders, grouped into spaces (like Work or "
    "Health) and lists. Everything here is THEIR data, so act only on what they ask.\n"
    "- To see what's on, use show_today. To find things, use list_tasks, open_space, list_notes, or ask_confia for a question "
    "answered from their notes.\n"
    "- Save free-form text (a meeting, a plan) with capture; use add_task for one precise to-do.\n"
    "- A reminder always comes BEFORE the due date/time. Give remind_before_minutes (10, 60, 1440...) or a remind_at that is "
    "no later than the due moment.\n"
    "- Never delete anything (to-do, note, list, space) without the person clearly agreeing first; the delete tools need "
    "confirm=true.\n"
    "- Dates are YYYY-MM-DD, times 24-hour HH:MM, in the person's own time zone."
)


def _uri(view: str) -> str:
    return f"ui://confia/{view}"


def tool_list() -> list:
    out = []
    for name, (title, description, schema, annotations, view, _fn) in mcp_tools.TOOLS.items():
        tool = {"name": name, "title": title, "description": description, "inputSchema": schema,
                "annotations": {**annotations, "title": title}}
        if view:
            # Both spellings: the current MCP Apps one and the earlier flat key some hosts still read.
            tool["_meta"] = {"ui": {"resourceUri": _uri(view)}, "ui/resourceUri": _uri(view)}
        out.append(tool)
    return out


def resource_list() -> list:
    return [{"uri": _uri(v), "name": f"confia-{v}", "title": f"MyConfía {v.title()}", "mimeType": UI_MIME,
             "description": f"Interactive {v} view for MyConfía"} for v in mcp_ui.VIEWS]


def _ok(msg_id, result) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _err(msg_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


def _tool_result(text: str, data: Optional[dict] = None, error: bool = False) -> dict:
    text = text if len(text) <= MAX_TEXT else text[:MAX_TEXT] + "\n…(shortened)"
    result: dict = {"content": [{"type": "text", "text": text}], "isError": error}
    if data is not None and not error:
        result["structuredContent"] = data
    return result


async def handle(message: dict, user_id: str) -> Optional[dict]:
    """One JSON-RPC message in, its answer out - or None for a notification (which has no answer)."""
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        return _err(message.get("id") if isinstance(message, dict) else None, -32600, "Invalid request")
    method, msg_id, params = message.get("method"), message.get("id"), message.get("params") or {}
    if "id" not in message:  # a notification: nothing to say back
        return None
    try:
        if method == "initialize":
            asked = params.get("protocolVersion")
            return _ok(msg_id, {
                "protocolVersion": asked if asked in PROTOCOLS else PROTOCOLS[0],
                "capabilities": {"tools": {"listChanged": False}, "resources": {"listChanged": False}, "prompts": {"listChanged": False}},
                "serverInfo": {"name": SERVER_NAME, "title": "MyConfía", "version": SERVER_VERSION},
                "instructions": INSTRUCTIONS,
            })
        if method == "ping":
            return _ok(msg_id, {})
        if method == "tools/list":
            return _ok(msg_id, {"tools": tool_list()})
        if method == "tools/call":
            name = params.get("name")
            if name not in mcp_tools.TOOLS:
                return _err(msg_id, -32602, f"Unknown tool: {name}")
            args = params.get("arguments") or {}
            if not isinstance(args, dict):
                return _err(msg_id, -32602, "arguments must be an object")
            try:
                out = await mcp_tools.run(name, user_id, args)
            except mcp_tools.ToolError as e:
                return _ok(msg_id, _tool_result(str(e), error=True))
            except Exception as e:  # noqa: BLE001 - one bad tool must not take the server down
                import observability

                observability.record("error", "mcp_tool_failed", user_id=user_id, detail={"tool": name, "type": type(e).__name__, "message": str(e)[:200]})
                return _ok(msg_id, _tool_result("Something went wrong on MyConfía's side - please try again.", error=True))
            return _ok(msg_id, _tool_result(out["text"], out.get("data")))
        if method == "resources/list":
            return _ok(msg_id, {"resources": resource_list()})
        if method == "resources/templates/list":
            return _ok(msg_id, {"resourceTemplates": []})
        if method == "resources/read":
            uri = params.get("uri", "")
            view = uri.removeprefix("ui://confia/")
            if not uri.startswith("ui://confia/") or view not in mcp_ui.VIEWS:
                return _err(msg_id, -32002, f"Unknown resource: {uri}")
            return _ok(msg_id, {"contents": [{"uri": uri, "mimeType": UI_MIME, "text": mcp_ui.html(view), "_meta": {"ui": {"prefersBorder": False}}}]})
        if method == "prompts/list":
            return _ok(msg_id, {"prompts": [{"name": k, "title": v[0], "description": v[1]} for k, v in mcp_tools.PROMPTS.items()]})
        if method == "prompts/get":
            prompt = mcp_tools.PROMPTS.get(params.get("name"))
            if not prompt:
                return _err(msg_id, -32602, "Unknown prompt")
            return _ok(msg_id, {"description": prompt[1], "messages": [{"role": "user", "content": {"type": "text", "text": prompt[2]}}]})
        if method == "logging/setLevel":
            return _ok(msg_id, {})
        return _err(msg_id, -32601, f"Method not found: {method}")
    except Exception as e:  # noqa: BLE001
        return _err(msg_id, -32603, f"Internal error: {type(e).__name__}")
