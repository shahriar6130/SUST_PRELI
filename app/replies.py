from __future__ import annotations

from app.schemas import CaseType, Department, EvidenceVerdict


def _txn(txn_id: str | None) -> str:
    return txn_id or "the reported transaction"


def customer_template(case_type: CaseType, verdict: EvidenceVerdict, language: str, txn_id: str | None) -> str:
    if verdict == EvidenceVerdict.insufficient_data and case_type != CaseType.phishing_or_social_engineering:
        if language == "bn":
            return "ধন্যবাদ। দ্রুত সহায়তার জন্য অনুগ্রহ করে ট্রানজ্যাকশন আইডি, টাকার পরিমাণ এবং কী সমস্যা হয়েছে তা সংক্ষেপে জানান। আপনার PIN বা OTP কারও সঙ্গে শেয়ার করবেন না।"
        return "Thank you for reaching out. To help you faster, please share the transaction ID, the amount, and a short description of what went wrong. Please do not share your PIN or OTP with anyone."

    if case_type == CaseType.phishing_or_social_engineering:
        if language == "bn":
            return "তথ্য শেয়ার করার আগে আমাদের জানানোর জন্য ধন্যবাদ। আমরা কখনও আপনার PIN, OTP বা পাসওয়ার্ড চাই না। কেউ আমাদের পরিচয় দিলেও এগুলো শেয়ার করবেন না। আমাদের fraud team বিষয়টি দেখবে।"
        return "Thank you for reaching out before sharing any information. We never ask for your PIN, OTP, or password under any circumstances. Please do not share these with anyone, even if they claim to be from us. Our fraud team has been notified."

    if case_type in {CaseType.wrong_transfer, CaseType.agent_cash_in_issue}:
        if language == "bn":
            return f"ট্রানজ্যাকশন {_txn(txn_id)} নিয়ে আপনার অভিযোগ আমরা নথিভুক্ত করেছি। সংশ্লিষ্ট টিম বিষয়টি যাচাই করে official support channels এর মাধ্যমে যোগাযোগ করবে। আপনার PIN বা OTP কারও সঙ্গে শেয়ার করবেন না।"
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
