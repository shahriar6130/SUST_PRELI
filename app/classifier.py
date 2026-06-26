from __future__ import annotations

import re
from collections import Counter

from app.schemas import CaseType, Transaction, TransactionType, UserType


BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def normalize_text(text: str) -> str:
    text = (text or "").translate(BN_DIGITS).lower()
    text = re.sub(r"[\"'`~!$%^&*()=\[\]{};<>?,।]", " ", text, flags=re.UNICODE)
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
        "from bkash", "from bKash".lower(), "agent called", "company called", "suspicious",
        "scam", "fraud", "link", "lottery", "prize", "ওটিপি", "পিন", "পাসওয়ার্ড",
        "প্রতারক", "ফোন দিয়ে", "ব্লক", "লিংক", "লটারি", "পুরস্কার",
    ]
    ask_terms = ["ask", "asked", "asking", "share", "tell", "give", "চাই", "চেয়েছে", "চেয়েছে", "দিতে", "বলেছে"]
    if _contains_any(text, phishing_terms) and (_contains_any(text, ask_terms) or _contains_any(text, ["scam", "fraud", "প্রতারক", "lottery", "prize", "link"])):
        return CaseType.phishing_or_social_engineering

    duplicate_terms = ["twice", "double", "duplicate", "two times", "2 times", "deducted 2", "দুইবার", "দুই বার"]
    if _contains_any(text, duplicate_terms) or has_duplicate_structure(transactions):
        return CaseType.duplicate_payment

    failed_terms = ["failed", "unsuccessful", "declined", "ব্যর্থ", "ফেইল", "ফেল"]
    deducted_terms = ["deducted", "balance gone", "money gone", "টাকা কাট", "কেটে", "ব্যালেন্স"]
    payment_terms = ["payment", "bill", "recharge", "pay", "পেমেন্ট", "বিল", "রিচার্জ"]
    if (_contains_any(text, failed_terms) and (_contains_any(text, deducted_terms) or _contains_any(text, payment_terms))):
        return CaseType.payment_failed

    agent_terms = ["cash in", "cash-in", "cashin", "agent", "deposited", "এজেন্ট", "ক্যাশ ইন", "টাকা আসেনি"]
    if _contains_any(text, agent_terms):
        return CaseType.agent_cash_in_issue

    settlement_terms = ["settlement", "settled", "payout", "merchant account", "সেটেলমেন্ট", "পেআউট"]
    if _contains_any(text, settlement_terms) or (user_type == UserType.merchant and any(t.type == TransactionType.settlement for t in transactions)):
        return CaseType.merchant_settlement_delay

    wrong_terms = [
        "wrong number", "wrong person", "by mistake", "mistake", "didn't get it", "did not get",
        "not received", "didn't receive", "did not receive", "sent but", "ভুল নাম্বার", "ভুল নম্বর",
        "ভুল করে", "পায়নি", "পায়নি", "পায় নাই", "পাইনি",
    ]
    if _contains_any(text, wrong_terms) or ("send" in text and "receive" in text):
        return CaseType.wrong_transfer

    refund_terms = ["refund", "return my money", "money back", "changed my mind", "ফেরত", "রিফান্ড"]
    if _contains_any(text, refund_terms):
        return CaseType.refund_request

    return CaseType.other
