from __future__ import annotations

from app.classifier import classify_case, detect_language
from app.llm import maybe_enhance
from app.matcher import match_transaction
from app.replies import customer_template, next_action
from app.routing import department_for, human_review_for, severity_for
from app.safety import enforce_response_safety, remove_injected_instructions
from app.schemas import (
    AnalyzeTicketRequest,
    AnalyzeTicketResponse,
    CaseType,
    EvidenceVerdict,
    Transaction,
)


_CASE_TYPE_LABEL = {
    CaseType.wrong_transfer: "wrong transfer",
    CaseType.payment_failed: "failed payment",
    CaseType.duplicate_payment: "duplicate payment",
    CaseType.refund_request: "refund request",
    CaseType.merchant_settlement_delay: "merchant settlement delay",
    CaseType.agent_cash_in_issue: "agent cash-in issue",
    CaseType.phishing_or_social_engineering: "phishing / social engineering",
    CaseType.other: "unclassified complaint",
}


def _format_amount(value: float | None) -> str:
    if value is None:
        return "an unspecified amount"
    if value >= 1000:
        return f"{value:,.0f} BDT"
    return f"{value} BDT"


def _txn_line(txn: Transaction | None) -> str:
    if not txn or not txn.transaction_id:
        return ""
    bits = [f"transaction {txn.transaction_id}"]
    if txn.amount is not None:
        bits.append(f"amount {_format_amount(txn.amount)}")
    if txn.counterparty:
        bits.append(f"counterparty {txn.counterparty}")
    if txn.timestamp:
        bits.append(f"at {txn.timestamp}")
    if txn.status and txn.status.value != "unknown":
        bits.append(f"status {txn.status.value}")
    return "; ".join(bits) + "."


def build_agent_summary(request: AnalyzeTicketRequest, match, case_type: CaseType) -> str:
    label = _CASE_TYPE_LABEL.get(case_type, case_type.value)
    verdict = match.verdict.value.replace("_", " ")

    matched_txn = None
    if match.relevant_transaction_id:
        matched_txn = next(
            (t for t in request.transaction_history if t.transaction_id == match.relevant_transaction_id),
            None,
        )
    txn_line = _txn_line(matched_txn)

    if match.verdict == EvidenceVerdict.insufficient_data:
        if case_type == CaseType.phishing_or_social_engineering:
            return (
                f"Ticket {request.ticket_id} is a phishing or social-engineering report "
                f"with no matching transaction in the provided history. The customer has "
                f"been advised not to share credentials; preserve the complaint details "
                f"and route to fraud_risk for review."
            )
        return (
            f"Ticket {request.ticket_id} is an unclassified complaint with insufficient "
            f"evidence: the provided transaction history does not let the service point "
            f"to a single matching transaction. Ask the customer for the transaction ID, "
            f"the amount, the counterparty, and the approximate time before opening a case."
        )
    if match.verdict == EvidenceVerdict.inconsistent:
        return (
            f"Ticket {request.ticket_id} is a {label} flagged as inconsistent: "
            f"the matched {txn_line or 'transaction does not align'} does not align with "
            f"the customer's claim. Route for manual review and do not confirm any "
            f"refund, reversal, or recovery at this stage."
        )
    # consistent
    return (
        f"Ticket {request.ticket_id} is a {label}; evidence is {verdict}. "
        f"Matched {txn_line or 'no transaction details are available'} "
        f"Confirm with the customer before initiating any financial action."
    )


async def analyze(request: AnalyzeTicketRequest) -> AnalyzeTicketResponse:
    language = detect_language(request.complaint, request.language)
    complaint_for_analysis = remove_injected_instructions(request.complaint)
    case_type = classify_case(complaint_for_analysis, request.transaction_history, request.user_type)
    match = match_transaction(complaint_for_analysis, case_type, request.transaction_history)
    department = department_for(case_type, request.user_type)
    severity = severity_for(case_type, match.verdict, match.amount)
    human_review = human_review_for(case_type, match.verdict, match.amount)

    response = AnalyzeTicketResponse(
        ticket_id=request.ticket_id,
        relevant_transaction_id=match.relevant_transaction_id,
        evidence_verdict=match.verdict,
        case_type=case_type,
        severity=severity,
        department=department,
        agent_summary=build_agent_summary(request, match, case_type),
        recommended_next_action=next_action(case_type, match.verdict, department, match.relevant_transaction_id),
        customer_reply=customer_template(case_type, match.verdict, "bn" if language == "bn" else "en", match.relevant_transaction_id),
        human_review_required=human_review,
        confidence=round(match.confidence, 2),
        reason_codes=match.reason_codes,
    )
    response = await maybe_enhance(response, request.complaint)
    return enforce_response_safety(response, "bn" if language == "bn" else "en")
