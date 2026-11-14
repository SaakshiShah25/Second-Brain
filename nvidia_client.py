"""
nvidia_client.py — Second provider for note extraction, used when Groq's
free-tier budget for the extraction model is used up (see extraction.py).

Why NVIDIA: build.nvidia.com hosts models behind an OpenAI-compatible
endpoint with a free developer key and far more room than Groq's 200K
tokens/day for one model. Measured with this app's real extraction prompt
(2026-11): nvidia/nemotron-3-ultra-550b-a55b returns valid JSON in ~5 s
(~5,300 tokens per note) and nvidia/nemotron-3.5-lightning-30b-a3b in ~8 s.
Both are "thinking" models: left alone they reason for 60-75 s first, so
`enable_thinking` is switched off - extraction only needs the JSON.
(gpt-oss-20b, DeepSeek and Mistral Large were queued for 45 s+ on the free
endpoint, and nemotron-3-super-120b is listed but not callable on a free
account, so they are not used.)

Off unless NVIDIA_API_KEY is set; NVIDIA_FALLBACK=off turns it off even
with a key. NVIDIA_MODELS (comma-separated) overrides the models tried, in
order. Plain REST, like gemini_client.py - no extra dependency.

Get a key at https://build.nvidia.com (NVIDIA Developer Program, free).
"""

import json
import os
import time

import requests

import observability

URL = "https://integrate.api.nvidia.com/v1/chat/completions"
DEFAULT_MODELS = ["nvidia/nemotron-3-ultra-550b-a55b", "nvidia/nemotron-3.5-lightning-30b-a3b"]
# The free endpoint is shared and sometimes queues; past this a user is better
# off being told to retry than waiting.
TIMEOUT_SECONDS = 45


def available() -> bool:
    return bool(os.environ.get("NVIDIA_API_KEY")) and os.environ.get("NVIDIA_FALLBACK", "on").lower() != "off"


def models() -> list:
    configured = [m.strip() for m in os.environ.get("NVIDIA_MODELS", "").split(",") if m.strip()]
    return configured or DEFAULT_MODELS


def generate_json(system_prompt: str, user_content: str, temperature: float = 0.2) -> str:
    """The model's raw JSON text. Tries each model in turn; a model that times
    out, errors or returns something that is not JSON is skipped. Raises
    RuntimeError if none of them produced JSON."""
    api_key = os.environ.get("NVIDIA_API_KEY")
    feature = observability.current_feature() or "extraction"
    last = "no model tried"
    for model in models():
        started = time.time()
        try:
            resp = requests.post(
                URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model,
                    "temperature": temperature,
                    "max_tokens": 4000,
                    "response_format": {"type": "json_object"},
                    "chat_template_kwargs": {"enable_thinking": False},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content},
                    ],
                },
                timeout=TIMEOUT_SECONDS,
            )
            resp.raise_for_status()
            body = resp.json()
            content = body["choices"][0]["message"]["content"] or ""
            json.loads(content)  # reject non-JSON here so the next model gets a turn
        except (requests.RequestException, KeyError, IndexError, ValueError) as e:
            last = f"{model}: {type(e).__name__}"
            response = getattr(e, "response", None)
            # Which model, what went wrong (a timeout, 401 = bad key, 404 = model not available to the key, 429, not JSON...).
            observability.record(
                "limit", "nvidia_fallback_failed", model=model,
                status=getattr(response, "status_code", None),
                detail={"feature": feature, "error": type(e).__name__, "message": str(e)[:160]},
            )
            continue
        usage = body.get("usage") or {}
        observability.record("llm", feature, model=model, tokens=usage.get("total_tokens"), duration_ms=(time.time() - started) * 1000,
                             detail={"prompt": usage.get("prompt_tokens"), "completion": usage.get("completion_tokens"), "fallback": True})
        # Tell the admin once a day that notes are going through the backup (the admin page has the running count).
        observability.alert(
            f"nvidia_used:{time.strftime('%Y-%m-%d', time.gmtime())}",
            "Notes are going through the NVIDIA backup",
            f"Groq could not take a note, so {model} did (about {usage.get('total_tokens') or '?'} tokens). "
            "The admin page's 'Backup AI' card shows how many notes so far today.",
        )
        return content
    raise RuntimeError(f"NVIDIA fallback failed ({last})")
