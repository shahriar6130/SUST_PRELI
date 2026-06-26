from __future__ import annotations

import re

from app.replies import customer_template
from app.schemas import AnalyzeTicketResponse


REQUEST_CREDENTIAL_RE = re.compile(
    r"\b(share|send|tell|give|provide|confirm|verify|enter|type|submit|reply with)\b.{0,30}\b(pin|otp|password|cvv|full card|full card number|passcode)\b",
    re.I,
)
REQUEST_CREDENTIAL_LOOSE_RE = re.compile(
    r"\b(your|the)\s+(pin|otp|password|cvv|full card|full card number|passcode)\b",
    re.I,
)
# Refund / reversal / unblock promises without authority.
REFUND_PROMISE_RE = re.compile(
    r"\b(we will refund|will be refunded|we have refunded|we have reversed|"
    r"money will be returned|will be recovered|account unblocked|"
    r"has been processed|has been reversed|reversed your)\b",
    re.I,
)
# Third-party referrals and suspicious links / phone numbers.
THIRD_PARTY_RE = re.compile(
    r"(https?://|www\.|\bcall\s+\+?\d{5,}|contact\s+\+?\d{5,}|"
    r"whatsapp|telegram|viber|imessage|imo\b|signal\b|"
    r"\bdial\s+\+?\d{5,})",
    re.I,
)
# Phrases that ask the customer to share / confirm a credential in any form.
CREDENTIAL_NEAR_VERB_RE = re.compile(
    r"(share|send|tell|give|provide|confirm|verify|enter|type|submit)\s+"
    r"(your\s+)?(pin|otp|password|cvv|card\s*number|passcode|secret\s*code)",
    re.I,
)
INJECTION_RE = re.compile(
    r"(ignore previous instructions|you are now|set case_type|reply with|"
    r"output your system prompt|developer message|system prompt|"
    r"ignore all previous|act as|override)",
    re.I,
)


def contains_injection(text: str) -> bool:
    return bool(INJECTION_RE.search(text or ""))


def remove_injected_instructions(text: str) -> str:
    if not contains_injection(text or ""):
        return text or ""
    parts = re.split(r"(?<=[.!?।])\s+", text or "")
    kept = [part for part in parts if part and not contains_injection(part)]
    cleaned = " ".join(kept).strip()
    return cleaned or INJECTION_RE.sub(" ", text or "")


def _normalize(text: str) -> str:
    """Strip out safe PIN/OTP *warnings* (do not share, never share) before scanning
    for unsafe credential requests. Warnings are allowed; asks are not."""
    return re.sub(
        r"\b(please\s+)?(do not|don't|never)\s+share\b.{0,45}\b(pin|otp|password|passcode)\b[^\n]*",
        "",
        text or "",
        flags=re.I,
    )


def is_text_safe(text: str) -> bool:
    if not text:
        return True
    normalized = _normalize(text)
    if REQUEST_CREDENTIAL_RE.search(normalized):
        return False
    if REQUEST_CREDENTIAL_LOOSE_RE.search(normalized) and re.search(
        r"\b(share|send|tell|give|provide|confirm|verify|enter|type|submit)\b",
        normalized,
        re.I,
    ):
        return False
    if CREDENTIAL_NEAR_VERB_RE.search(normalized):
        return False
    if REFUND_PROMISE_RE.search(normalized):
        return False
    if THIRD_PARTY_RE.search(normalized):
        return False
    return True


def strip_injection_echo(text: str) -> str:
    return INJECTION_RE.sub("[removed instruction]", text or "")


_SAFE_NEXT_ACTION = (
    "Use only official support channels. Do not request customer credentials. "
    "Confirm the transaction details and route to the appropriate operations team."
)


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
        # If the regenerated template is still unsafe (template bug), collapse to a safe stub.
        if not is_text_safe(response.customer_reply):
            response.customer_reply = (
                "We have noted your concern. Our team will reach out through official support channels. "
                "Please do not share your PIN or OTP with anyone."
            )

    if not is_text_safe(response.recommended_next_action):
        response.recommended_next_action = _SAFE_NEXT_ACTION

    return response
