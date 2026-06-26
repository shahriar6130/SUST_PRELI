"""Rubric §8 belt-and-suspenders test: even if the LLM tries to ship a forbidden
refund / reversal / unblock promise, the safety post-processor must replace it
with the safe template.

The build prompt says (§8.1):
    "Never confirm a refund/reversal/unblock/recovery. Use only authority-safe
     language: 'any eligible amount will be returned through official channels'."

This test feeds the safety layer the *exact forbidden phrases* and asserts the
output is the safe template — not the LLM rewrite. The same check is repeated
in Bangla to ensure the Bengali reply path is also safe.
"""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.safety import (
    REFUND_PROMISE_RE,
    enforce_response_safety,
    is_text_safe,
)
from app.schemas import (
    AnalyzeTicketRequest,
    AnalyzeTicketResponse,
    CaseType,
    Department,
    EvidenceVerdict,
    Severity,
    Transaction,
)


def _build_response(agent_summary: str, customer_reply: str,
                    language_hint: str = "en") -> AnalyzeTicketResponse:
    """Build a response whose text fields we can poison for the safety test."""
    req = AnalyzeTicketRequest(
        ticket_id="TKT-LLM-SAFETY",
        complaint="I sent 5000 taka to the wrong number today",
        language=language_hint,
        channel="in_app_chat",
        user_type="customer",
        transaction_history=[
            Transaction(
                transaction_id="TXN-9101",
                timestamp="2026-04-14T14:08:22Z",
                type="transfer",
                amount=5000,
                counterparty="+8801719876543",
                status="completed",
            )
        ],
        metadata={},
    )
    return AnalyzeTicketResponse(
        ticket_id=req.ticket_id,
        relevant_transaction_id="TXN-9101",
        evidence_verdict=EvidenceVerdict.consistent,
        case_type=CaseType.wrong_transfer,
        severity=Severity.high,
        department=Department.dispute_resolution,
        agent_summary=agent_summary,
        recommended_next_action="Route transaction TXN-9101 to dispute_resolution.",
        customer_reply=customer_reply,
        human_review_required=True,
        confidence=0.9,
        reason_codes=["wrong_transfer", "amount_match"],
    )


# --- Forbidden phrases (English) ---------------------------------------------

EN_FORBIDDEN = [
    "We will refund you the 5000 BDT today.",
    "Your money will be returned within 24 hours.",
    "We have reversed the transaction already.",
    "Your account is now unblocked and the funds will be recovered.",
    "The reversal has been processed successfully.",
]


@pytest.mark.parametrize("forbidden_reply", EN_FORBIDDEN)
def test_forbidden_refund_phrases_are_redacted_english(forbidden_reply: str) -> None:
    """is_text_safe() must reject every forbidden phrase."""
    assert is_text_safe(forbidden_reply) is False, (
        f"forbidden phrase escaped safety check: {forbidden_reply!r}"
    )

    # And the post-processor must replace it with the safe template.
    resp = _build_response(
        agent_summary="Ticket flagged for review.",
        customer_reply=forbidden_reply,
        language_hint="en",
    )
    safe = enforce_response_safety(resp, language="en")
    # Forbidden substring gone.
    assert not REFUND_PROMISE_RE.search(safe.customer_reply or ""), (
        f"customer_reply still contains a refund promise: {safe.customer_reply!r}"
    )
    # The replacement must be the safe template, not silently emptied.
    assert safe.customer_reply, "customer_reply was cleared, not replaced"
    # The safe template always warns the customer not to share credentials.
    assert "PIN" in safe.customer_reply or "OTP" in safe.customer_reply, (
        f"safe template missing the PIN/OTP warning: {safe.customer_reply!r}"
    )


# --- Forbidden phrases (Bangla) ----------------------------------------------

BN_FORBIDDEN = [
    "আমরা আপনার টাকা ফেরত দেব।",          # "we will return your money"
    "লেনদেনটি বিপরীত করা হয়েছে।",        # "the transaction has been reversed"
    "অ্যাকাউন্ট আনব্লক করা হয়েছে।",      # "account has been unblocked"
]


@pytest.mark.parametrize("forbidden_reply", BN_FORBIDDEN)
def test_forbidden_refund_phrases_are_redacted_bangla(forbidden_reply: str) -> None:
    """Bangla refund promises must also be redacted and replaced with a Bangla
    safe template (not an English one, not an empty string)."""
    assert is_text_safe(forbidden_reply) is False
    resp = _build_response(
        agent_summary="Ticket flagged for review.",
        customer_reply=forbidden_reply,
        language_hint="bn",
    )
    safe = enforce_response_safety(resp, language="bn")
    # The original forbidden phrase must be gone.
    assert safe.customer_reply != forbidden_reply
    assert not REFUND_PROMISE_RE.search(safe.customer_reply or "")
    # Bangla must stay Bangla — the safe Bengali template is the only replacement.
    assert any("\u0980" <= ch <= "\u09ff" for ch in safe.customer_reply), (
        f"safe template should be Bangla, got: {safe.customer_reply!r}"
    )
    assert safe.customer_reply, "customer_reply was cleared, not replaced"


# --- End-to-end: poisoning through /analyze-ticket ---------------------------

def test_end_to_end_forbidden_reply_is_replaced(monkeypatch) -> None:
    """If the LLM were ever to inject a refund promise into the response,
    the HTTP response body must still contain the safe template, not the
    LLM's forbidden rewrite.

    We simulate the LLM by monkey-patching `app.llm.maybe_enhance` to return
    a response whose `customer_reply` carries a forbidden phrase. The
    downstream safety post-processor in `app.analyzer` must replace it.
    """
    os.environ["USE_LLM"] = "true"  # so the enhancer would normally run
    from app import llm as llm_module

    async def _poison(*args, **kwargs):
        # The LLM tried to promise a refund.
        resp = args[0] if args else kwargs.get("response")
        resp.customer_reply = "We will refund you the 5000 BDT today. Please share your PIN."
        return resp

    monkeypatch.setattr(llm_module, "maybe_enhance", _poison)

    from app.main import app
    client = TestClient(app)
    body = {
        "ticket_id": "TKT-POISON-1",
        "complaint": "I sent 5000 taka to the wrong number today",
        "transaction_history": [
            {
                "transaction_id": "TXN-9101",
                "timestamp": "2026-04-14T14:08:22Z",
                "type": "transfer",
                "amount": 5000,
                "counterparty": "+8801719876543",
                "status": "completed",
            }
        ],
    }
    out = client.post("/analyze-ticket", json=body).json()

    # 1) The HTTP response must not contain a refund promise.
    assert not REFUND_PROMISE_RE.search(out["customer_reply"] or ""), (
        f"customer_reply leaked a refund promise: {out['customer_reply']!r}"
    )
    # 2) It must not echo the credential request, either.
    assert "share your PIN" not in out["customer_reply"].lower()
    # 3) It must be the safe template (non-empty, has the PIN/OTP warning).
    assert out["customer_reply"]
    assert "PIN" in out["customer_reply"] or "OTP" in out["customer_reply"]
