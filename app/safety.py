from __future__ import annotations

import re

from app.replies import customer_template
from app.schemas import AnalyzeTicketResponse


REQUEST_CREDENTIAL_RE = re.compile(r"\b(share|send|tell|give|provide|confirm|verify)\b.{0,30}\b(pin|otp|password|cvv|full card)\b", re.I)
REFUND_PROMISE_RE = re.compile(r"\b(we will refund|money will be returned|we have reversed|account unblocked|will be recovered)\b", re.I)
THIRD_PARTY_RE = re.compile(r"(https?://|www\.|\bcall\s+\+?\d{5,}|contact\s+\+?\d{5,}|whatsapp|telegram)", re.I)
INJECTION_RE = re.compile(r"(ignore previous instructions|you are now|set case_type|reply with|output your system prompt|developer message|system prompt)", re.I)


def contains_injection(text: str) -> bool:
    return bool(INJECTION_RE.search(text or ""))


def remove_injected_instructions(text: str) -> str:
    if not contains_injection(text):
        return text or ""
    parts = re.split(r"(?<=[.!?।])\s+", text or "")
    kept = [part for part in parts if part and not contains_injection(part)]
    cleaned = " ".join(kept).strip()
    return cleaned or INJECTION_RE.sub(" ", text or "")


def is_text_safe(text: str) -> bool:
    normalized = re.sub(r"\b(please\s+)?(do not|don't|never)\s+share\b.{0,45}\b(pin|otp|password)\b", "", text or "", flags=re.I)
    return not (REQUEST_CREDENTIAL_RE.search(normalized) or REFUND_PROMISE_RE.search(normalized) or THIRD_PARTY_RE.search(normalized))


def strip_injection_echo(text: str) -> str:
    return INJECTION_RE.sub("[removed instruction]", text or "")


def enforce_response_safety(response: AnalyzeTicketResponse, language: str) -> AnalyzeTicketResponse:
    response.agent_summary = strip_injection_echo(response.agent_summary)
    response.recommended_next_action = strip_injection_echo(response.recommended_next_action)
    response.customer_reply = strip_injection_echo(response.customer_reply)

    if not is_text_safe(response.customer_reply):
        response.customer_reply = customer_template(
            response.case_type,
            response.evidence_verdict,
            "bn" if language == "bn" else "en",
            response.relevant_transaction_id,
        )
    if not is_text_safe(response.recommended_next_action):
        response.recommended_next_action = "Use only official support channels and continue review without requesting customer credentials."
    return response
