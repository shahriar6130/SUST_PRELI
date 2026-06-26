from __future__ import annotations

import re
from collections import Counter

from app.schemas import CaseType, Transaction, TransactionType, UserType


BN_DIGITS = str.maketrans("\u09e6\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed\u09ee\u09ef", "0123456789")


def normalize_text(text: str) -> str:
    text = (text or "").translate(BN_DIGITS).lower()
    text = re.sub(r"[\"'`~!$%^&*()=\[\]{};<>?,\u0964]", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def has_bangla(text: str) -> bool:
    return bool(re.search(r"[\u0980-\u09ff]", text or ""))


def detect_language(complaint: str, language: object | None = None) -> str:
    raw = getattr(language, "value", language)
    if raw in {"en", "bn", "mixed"}:
        return str(raw)
    bangla = has_bangla(complaint)
    latin = bool(re.search(r"[a-zA-Z]", complaint or ""))
    if bangla and latin:
        return "mixed"
    if bangla:
        return "bn"
    return "en"


def _contains_any(text: str, keywords: list[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def has_duplicate_structure(transactions: list[Transaction]) -> bool:
    seen: Counter[tuple[float | None, str | None, str]] = Counter()
    for txn in transactions:
        if txn.type not in {TransactionType.payment, TransactionType.unknown}:
            continue
        key = (txn.amount, txn.counterparty, str(txn.type.value))
        if txn.amount is not None and txn.counterparty:
            seen[key] += 1
    return any(count >= 2 for count in seen.values())


def classify_case(complaint: str, transactions: list[Transaction], user_type: UserType) -> CaseType:
    text = normalize_text(complaint)

    phishing_terms = [
        "otp", "pin", "password", "passcode", "card number", "cvv", "blocked if", "block if",
        "from bkash", "agent called", "company called", "suspicious", "scam", "fraud",
        "link", "lottery", "prize", "\u0993\u099f\u09bf\u09aa\u09bf", "\u09aa\u09bf\u09a8",
        "\u09aa\u09be\u09b8\u0993\u09af\u09bc\u09be\u09b0\u09cd\u09a1", "\u09aa\u09be\u09b8\u0993\u09df\u09be\u09b0\u09cd\u09a1",
        "\u09aa\u09cd\u09b0\u09a4\u09be\u09b0\u0995", "\u09ab\u09cb\u09a8 \u09a6\u09bf\u09af\u09bc\u09c7",
        "\u09ab\u09cb\u09a8 \u09a6\u09bf\u09df\u09c7", "\u09ac\u09cd\u09b2\u0995", "\u09b2\u09bf\u0982\u0995",
        "\u09b2\u099f\u09be\u09b0\u09bf", "\u09aa\u09c1\u09b0\u09b8\u09cd\u0995\u09be\u09b0",
    ]
    ask_terms = [
        "ask", "asked", "asking", "share", "tell", "give", "\u099a\u09be\u0987",
        "\u099a\u09c7\u09df\u09c7\u099b\u09c7", "\u099a\u09c7\u09af\u09bc\u09c7\u099b\u09c7",
        "\u09a6\u09bf\u09a4\u09c7", "\u09ac\u09b2\u09c7\u099b\u09c7",
    ]
    high_risk_terms = ["scam", "fraud", "lottery", "prize", "link", "\u09aa\u09cd\u09b0\u09a4\u09be\u09b0\u0995"]
    if _contains_any(text, phishing_terms) and (_contains_any(text, ask_terms) or _contains_any(text, high_risk_terms)):
        return CaseType.phishing_or_social_engineering

    duplicate_terms = [
        "twice", "double", "duplicate", "two times", "2 times", "deducted 2",
        "\u09a6\u09c1\u0987\u09ac\u09be\u09b0", "\u09a6\u09c1\u0987 \u09ac\u09be\u09b0",
    ]
    if _contains_any(text, duplicate_terms) or has_duplicate_structure(transactions):
        return CaseType.duplicate_payment

    failed_terms = ["failed", "unsuccessful", "declined", "\u09ac\u09cd\u09af\u09b0\u09cd\u09a5", "\u09ab\u09c7\u0987\u09b2", "\u09ab\u09c7\u09b2"]
    deducted_terms = [
        "deducted", "balance gone", "money gone", "\u099f\u09be\u0995\u09be \u0995\u09be\u099f",
        "\u0995\u09c7\u099f\u09c7", "\u09ac\u09cd\u09af\u09be\u09b2\u09c7\u09a8\u09cd\u09b8",
    ]
    payment_terms = ["payment", "bill", "recharge", "pay", "\u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f", "\u09ac\u09bf\u09b2", "\u09b0\u09bf\u099a\u09be\u09b0\u09cd\u099c"]
    if _contains_any(text, failed_terms) and (_contains_any(text, deducted_terms) or _contains_any(text, payment_terms)):
        return CaseType.payment_failed

    agent_terms = [
        "cash in", "cash-in", "cashin", "agent", "deposited", "\u098f\u099c\u09c7\u09a8\u09cd\u099f",
        "\u0995\u09cd\u09af\u09be\u09b6 \u0987\u09a8", "\u099f\u09be\u0995\u09be \u0986\u09b8\u09c7\u09a8\u09bf",
    ]
    if _contains_any(text, agent_terms):
        return CaseType.agent_cash_in_issue

    settlement_terms = ["settlement", "settled", "payout", "merchant account", "\u09b8\u09c7\u099f\u09c7\u09b2\u09ae\u09c7\u09a8\u09cd\u099f", "\u09aa\u09c7\u0986\u0989\u099f"]
    if _contains_any(text, settlement_terms) or (user_type == UserType.merchant and any(t.type == TransactionType.settlement for t in transactions)):
        return CaseType.merchant_settlement_delay

    wrong_terms = [
        "wrong number", "wrong person", "by mistake", "mistake", "didn't get it", "did not get",
        "not received", "didn't receive", "did not receive", "sent but",
        "\u09ad\u09c1\u09b2 \u09a8\u09be\u09ae\u09cd\u09ac\u09be\u09b0", "\u09ad\u09c1\u09b2 \u09a8\u09ae\u09cd\u09ac\u09b0",
        "\u09ad\u09c1\u09b2 \u0995\u09b0\u09c7", "\u09aa\u09be\u09af\u09bc\u09a8\u09bf", "\u09aa\u09be\u09df\u09a8\u09bf",
        "\u09aa\u09be\u09af\u09bc \u09a8\u09be\u0987", "\u09aa\u09be\u0987\u09a8\u09bf",
    ]
    if _contains_any(text, wrong_terms) or ("send" in text and "receive" in text):
        return CaseType.wrong_transfer

    refund_terms = ["refund", "return my money", "money back", "changed my mind", "\u09ab\u09c7\u09b0\u09a4", "\u09b0\u09bf\u09ab\u09be\u09a8\u09cd\u09a1"]
    if _contains_any(text, refund_terms):
        return CaseType.refund_request

    return CaseType.other
