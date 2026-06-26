from __future__ import annotations

from app.schemas import CaseType, Department, EvidenceVerdict


def _txn(txn_id: str | None) -> str:
    return txn_id or "the reported transaction"


BN_PIN_OTP_WARNING = "\u0986\u09aa\u09a8\u09be\u09b0 PIN \u09ac\u09be OTP \u0995\u09be\u09b0\u0993 \u09b8\u0999\u09cd\u0997\u09c7 \u09b6\u09c7\u09af\u09bc\u09be\u09b0 \u0995\u09b0\u09ac\u09c7\u09a8 \u09a8\u09be\u0964"


def customer_template(case_type: CaseType, verdict: EvidenceVerdict, language: str, txn_id: str | None) -> str:
    if verdict == EvidenceVerdict.insufficient_data and case_type != CaseType.phishing_or_social_engineering:
        if language == "bn":
            return (
                "\u09a7\u09a8\u09cd\u09af\u09ac\u09be\u09a6\u0964 \u09a6\u09cd\u09b0\u09c1\u09a4 \u09b8\u09b9\u09be\u09af\u09bc\u09a4\u09be\u09b0 \u099c\u09a8\u09cd\u09af "
                "\u0985\u09a8\u09c1\u0997\u09cd\u09b0\u09b9 \u0995\u09b0\u09c7 \u099f\u09cd\u09b0\u09be\u09a8\u099c\u09cd\u09af\u09be\u0995\u09b6\u09a8 \u0986\u0987\u09a1\u09bf, "
                "\u099f\u09be\u0995\u09be\u09b0 \u09aa\u09b0\u09bf\u09ae\u09be\u09a3 \u098f\u09ac\u0982 \u0995\u09c0 \u09b8\u09ae\u09b8\u09cd\u09af\u09be \u09b9\u09af\u09bc\u09c7\u099b\u09c7 "
                f"\u09a4\u09be \u09b8\u0982\u0995\u09cd\u09b7\u09c7\u09aa\u09c7 \u099c\u09be\u09a8\u09be\u09a8\u0964 {BN_PIN_OTP_WARNING}"
            )
        return "Thank you for reaching out. To help you faster, please share the transaction ID, the amount, and a short description of what went wrong. Please do not share your PIN or OTP with anyone."

    if case_type == CaseType.phishing_or_social_engineering:
        if language == "bn":
            return (
                "\u09a4\u09a5\u09cd\u09af \u09b6\u09c7\u09af\u09bc\u09be\u09b0 \u0995\u09b0\u09be\u09b0 \u0986\u0997\u09c7 \u0986\u09ae\u09be\u09a6\u09c7\u09b0 "
                "\u099c\u09be\u09a8\u09be\u09a8\u09cb\u09b0 \u099c\u09a8\u09cd\u09af \u09a7\u09a8\u09cd\u09af\u09ac\u09be\u09a6\u0964 "
                "\u0986\u09ae\u09b0\u09be \u0995\u0996\u09a8\u0993 \u0986\u09aa\u09a8\u09be\u09b0 PIN, OTP \u09ac\u09be "
                "\u09aa\u09be\u09b8\u0993\u09af\u09bc\u09be\u09b0\u09cd\u09a1 \u099a\u09be\u0987 \u09a8\u09be\u0964 "
                "\u0995\u09c7\u0989 \u0986\u09ae\u09be\u09a6\u09c7\u09b0 \u09aa\u09b0\u09bf\u099a\u09af\u09bc \u09a6\u09bf\u09b2\u09c7\u0993 "
                "\u098f\u0997\u09c1\u09b2\u09cb \u09b6\u09c7\u09af\u09bc\u09be\u09b0 \u0995\u09b0\u09ac\u09c7\u09a8 \u09a8\u09be\u0964 "
                "\u0986\u09ae\u09be\u09a6\u09c7\u09b0 fraud team \u09ac\u09bf\u09b7\u09af\u09bc\u099f\u09bf \u09a6\u09c7\u0996\u09ac\u09c7\u0964"
            )
        return "Thank you for reaching out before sharing any information. We never ask for your PIN, OTP, or password under any circumstances. Please do not share these with anyone, even if they claim to be from us. Our fraud team has been notified."

    if case_type in {CaseType.wrong_transfer, CaseType.agent_cash_in_issue}:
        if language == "bn":
            team = "\u098f\u099c\u09c7\u09a8\u09cd\u099f \u0985\u09aa\u09be\u09b0\u09c7\u09b6\u09a8\u09b8" if case_type == CaseType.agent_cash_in_issue else "\u09a1\u09bf\u09b8\u09aa\u09bf\u0989\u099f \u099f\u09bf\u09ae"
            return (
                f"\u099f\u09cd\u09b0\u09be\u09a8\u099c\u09cd\u09af\u09be\u0995\u09b6\u09a8 {_txn(txn_id)} \u09a8\u09bf\u09af\u09bc\u09c7 "
                "\u0986\u09aa\u09a8\u09be\u09b0 \u0985\u09ad\u09bf\u09af\u09cb\u0997 \u0986\u09ae\u09b0\u09be \u09a8\u09a5\u09bf\u09ad\u09c1\u0995\u09cd\u09a4 "
                f"\u0995\u09b0\u09c7\u099b\u09bf\u0964 \u09b8\u0982\u09b6\u09cd\u09b2\u09bf\u09b7\u09cd\u099f {team} \u09ac\u09bf\u09b7\u09af\u09bc\u099f\u09bf "
                "\u09af\u09be\u099a\u09be\u0987 \u0995\u09b0\u09c7 official support channels \u098f\u09b0 \u09ae\u09be\u09a7\u09cd\u09af\u09ae\u09c7 "
                f"\u09af\u09cb\u0997\u09be\u09af\u09cb\u0997 \u0995\u09b0\u09ac\u09c7\u0964 {BN_PIN_OTP_WARNING}"
            )
        return f"We have noted your concern about transaction {_txn(txn_id)}. Our dispute team will review the case and contact you through official support channels. Please do not share your PIN or OTP with anyone."

    if case_type in {CaseType.payment_failed, CaseType.duplicate_payment}:
        return f"We have noted the issue with transaction {_txn(txn_id)}. Our payments team will review it and any eligible amount will be returned through official channels. Please do not share your PIN or OTP with anyone."

    if case_type == CaseType.refund_request:
        return "Thank you for reaching out. Refunds for completed merchant payments depend on the merchant's own policy; please use official support channels for any further review. Please do not share your PIN or OTP with anyone."

    if case_type == CaseType.merchant_settlement_delay:
        return f"We have noted your concern about settlement {_txn(txn_id)}. Our merchant operations team will check the batch status and update you on the expected settlement time through official channels."

    return "Thank you for reaching out. We have noted your concern and our support team will review the available details through official support channels. Please do not share your PIN or OTP with anyone."


def next_action(case_type: CaseType, verdict: EvidenceVerdict, department: Department, txn_id: str | None) -> str:
    if verdict == EvidenceVerdict.insufficient_data and case_type != CaseType.phishing_or_social_engineering:
        return "Ask the customer for transaction ID, amount, counterparty, and approximate time before opening a case."
    if verdict == EvidenceVerdict.inconsistent:
        return f"Route to {department.value} for manual review of transaction {_txn(txn_id)} because the claim conflicts with account history."
    if case_type == CaseType.phishing_or_social_engineering:
        return "Route to fraud_risk, preserve complaint details, and advise the customer not to share credentials."
    if case_type == CaseType.payment_failed:
        return f"Route transaction {_txn(txn_id)} to payments_ops to verify debit/reversal state and SLA."
    if case_type == CaseType.duplicate_payment:
        return f"Route suspected duplicate transaction {_txn(txn_id)} to payments_ops for duplicate-charge investigation."
    if case_type == CaseType.merchant_settlement_delay:
        return f"Route settlement {_txn(txn_id)} to merchant_operations to check batch and payout status."
    if case_type == CaseType.agent_cash_in_issue:
        return f"Route cash-in transaction {_txn(txn_id)} to agent_operations for agent ledger review."
    if case_type == CaseType.wrong_transfer:
        return f"Route transaction {_txn(txn_id)} to dispute_resolution for wrong-transfer review."
    return "Handle through customer_support and request more details if the issue remains unclear."
