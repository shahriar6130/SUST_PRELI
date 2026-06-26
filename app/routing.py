from __future__ import annotations

from app.schemas import CaseType, Department, EvidenceVerdict, Severity, UserType


SEVERITY_ORDER = [Severity.low, Severity.medium, Severity.high, Severity.critical]


def department_for(case_type: CaseType, user_type: UserType) -> Department:
    if case_type == CaseType.wrong_transfer:
        return Department.dispute_resolution
    if case_type in {CaseType.payment_failed, CaseType.duplicate_payment}:
        return Department.payments_ops
    if case_type == CaseType.refund_request:
        return Department.customer_support
    if case_type == CaseType.merchant_settlement_delay or user_type == UserType.merchant:
        return Department.merchant_operations
    if case_type == CaseType.agent_cash_in_issue or user_type == UserType.agent:
        return Department.agent_operations
    if case_type == CaseType.phishing_or_social_engineering:
        return Department.fraud_risk
    return Department.customer_support


def severity_for(case_type: CaseType, verdict: EvidenceVerdict, amount: float | None) -> Severity:
    if case_type == CaseType.phishing_or_social_engineering:
        severity = Severity.critical
    elif case_type == CaseType.wrong_transfer:
        severity = Severity.high if verdict == EvidenceVerdict.consistent else Severity.medium
    elif case_type in {CaseType.payment_failed, CaseType.duplicate_payment, CaseType.agent_cash_in_issue}:
        severity = Severity.high
    elif case_type == CaseType.merchant_settlement_delay:
        severity = Severity.medium
    else:
        severity = Severity.low

    if amount is not None and amount >= 50000 and severity != Severity.critical:
        index = min(len(SEVERITY_ORDER) - 1, SEVERITY_ORDER.index(severity) + 1)
        severity = SEVERITY_ORDER[index]
    return severity


def human_review_for(case_type: CaseType, verdict: EvidenceVerdict, amount: float | None) -> bool:
    if case_type == CaseType.phishing_or_social_engineering:
        return True
    if case_type in {CaseType.wrong_transfer, CaseType.duplicate_payment, CaseType.agent_cash_in_issue} and verdict != EvidenceVerdict.insufficient_data:
        return True
    if verdict == EvidenceVerdict.inconsistent:
        return True
    if amount is not None and amount >= 50000:
        return True
    return False
