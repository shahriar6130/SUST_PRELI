from __future__ import annotations

from app.classifier import classify_case, detect_language
from app.llm import maybe_enhance
from app.matcher import match_transaction
from app.replies import customer_template, next_action
from app.routing import department_for, human_review_for, severity_for
from app.safety import enforce_response_safety, remove_injected_instructions
from app.schemas import AnalyzeTicketRequest, AnalyzeTicketResponse


def build_agent_summary(request: AnalyzeTicketRequest, match, case_type) -> str:
    txn = match.relevant_transaction_id or "no single transaction"
    verdict = match.verdict.value.replace("_", " ")
    return f"Ticket {request.ticket_id} is classified as {case_type.value}; evidence is {verdict} with {txn} identified. Route according to the case type and avoid requesting credentials."


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
