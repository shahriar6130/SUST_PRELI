from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

from app.safety import is_text_safe
from app.schemas import AnalyzeTicketResponse


logger = logging.getLogger("queuestorm.llm")

# Spec §9 requires an 8 s hard timeout. Override via env if a longer budget is desired.
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "8"))


def _llm_enabled() -> bool:
    return os.getenv("USE_LLM", "false").strip().lower() in {"1", "true", "yes"}


def _has_credentials() -> bool:
    provider = os.getenv("LLM_PROVIDER", "").strip().lower()
    api_key = os.getenv("LLM_API_KEY", "").strip()
    base_url = os.getenv("LLM_BASE_URL", "").strip()
    if not api_key or not base_url:
        return False
    return bool(provider)


def _build_prompt(response: AnalyzeTicketResponse, complaint: str) -> dict[str, Any]:
    """Build a JSON-mode prompt that ONLY rewrites text fields. Structured
    decisions are NOT exposed to the LLM to prevent prompt injection."""
    return {
        "task": "rewrite_two_fields_only",
        "rules": [
            "Never ask the customer for PIN, OTP, password, CVV, or full card number.",
            "Never promise a refund, reversal, account unblock, or recovery.",
            "Never direct the customer to a phone number, URL, or third party. Use only 'official support channels'.",
            "Keep the language matched to the customer (English, Bangla, or Banglish).",
            "Keep the meaning identical to the input. Do not change facts.",
            "Output strict JSON with keys: agent_summary, customer_reply.",
        ],
        "input": {
            "agent_summary": response.agent_summary,
            "customer_reply": response.customer_reply,
            "case_type": response.case_type.value,
            "language": "bn" if any("\u0980" <= ch <= "\u09ff" for ch in response.customer_reply) else "en",
        },
        "complaint_for_language_hint_only": complaint[:500],
    }


async def _call_provider(payload: dict[str, Any]) -> dict[str, Any] | None:
    base_url = os.getenv("LLM_BASE_URL", "").strip()
    api_key = os.getenv("LLM_API_KEY", "").strip()
    if not base_url or not api_key:
        return None
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {
        "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "You rewrite support text. You never change structured fields. You never request credentials or promise refunds. You return strict JSON."},
            {"role": "user", "content": json.dumps(payload)},
        ],
    }
    async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
        response = await client.post(base_url, headers=headers, json=body)
        response.raise_for_status()
        data = response.json()
    try:
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    except (KeyError, IndexError, json.JSONDecodeError, TypeError) as exc:
        logger.warning("llm response parse failed: %s", exc)
        return None


async def maybe_enhance(response: AnalyzeTicketResponse, complaint: str) -> AnalyzeTicketResponse:
    """Optional LLM enhancement. Hard-fails to the deterministic response on any
    issue (disabled, missing creds, timeout, parse error, unsafe rewrite)."""
    if not _llm_enabled():
        return response
    if not _has_credentials():
        return response
    try:
        rewrite = await _call_provider(_build_prompt(response, complaint))
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
        logger.warning("llm call failed: %s", exc)
        return response
    except Exception as exc:
        logger.error("llm unexpected error: %s", type(exc).__name__)
        return response

    if not rewrite:
        return response

    new_summary = str(rewrite.get("agent_summary", "")).strip() or response.agent_summary
    new_reply = str(rewrite.get("customer_reply", "")).strip() or response.customer_reply

    if not is_text_safe(new_reply):
        return response
    if not is_text_safe(new_summary):
        return response

    response.agent_summary = new_summary
    response.customer_reply = new_reply
    return response
