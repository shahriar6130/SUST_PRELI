from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.classifier import normalize_text
from app.schemas import CaseType, EvidenceVerdict, Transaction, TransactionStatus, TransactionType


WORD_AMOUNTS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "hundred": 100, "thousand": 1000, "lakh": 100000,
    "এক": 1, "দুই": 2, "তিন": 3, "চার": 4, "পাঁচ": 5, "ছয়": 6, "ছয়": 6, "সাত": 7,
    "আট": 8, "নয়": 9, "নয়": 9, "দশ": 10, "শত": 100, "হাজার": 1000, "লাখ": 100000,
}


@dataclass
class MatchResult:
    relevant_transaction_id: str | None
    verdict: EvidenceVerdict
    amount: float | None
    confidence: float
    reason_codes: list[str]


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def extract_amounts(complaint: str) -> list[float]:
    text = normalize_text(complaint)
    amounts: list[float] = []
    for raw in re.findall(r"(?<!\w)(\d+(?:,\d{3})*(?:\.\d+)?)", text):
        try:
            amounts.append(float(raw.replace(",", "")))
        except ValueError:
            pass

    tokens = text.split()
    for i, token in enumerate(tokens):
        if token in WORD_AMOUNTS:
            value = WORD_AMOUNTS[token]
            if i + 1 < len(tokens) and tokens[i + 1] in {"thousand", "hundred", "lakh", "হাজার", "শত", "লাখ"}:
                value *= WORD_AMOUNTS[tokens[i + 1]]
                amounts.append(float(value))
            elif token not in {"thousand", "hundred", "lakh", "হাজার", "শত", "লাখ"}:
                amounts.append(float(value))
    deduped: list[float] = []
    for amount in amounts:
        if amount not in deduped:
            deduped.append(amount)
    return deduped


def extract_counterparties(complaint: str) -> list[str]:
    text = normalize_text(complaint)
    values = re.findall(r"(?:\+?8801\d{9}|01\d{9}|agent-[a-z0-9_-]+|merchant-[a-z0-9_-]+|m[a-z0-9_-]{3,})", text)
    return [v.lower() for v in values]


def infer_type(case_type: CaseType, complaint: str) -> TransactionType | None:
    text = normalize_text(complaint)
    if case_type == CaseType.wrong_transfer:
        return TransactionType.transfer
    if case_type in {CaseType.payment_failed, CaseType.duplicate_payment, CaseType.refund_request}:
        return TransactionType.payment
    if case_type == CaseType.agent_cash_in_issue:
        return TransactionType.cash_in
    if case_type == CaseType.merchant_settlement_delay:
        return TransactionType.settlement
    if any(word in text for word in ["send", "sent", "transfer", "ভুল"]):
        return TransactionType.transfer
    if any(word in text for word in ["payment", "bill", "recharge", "pay"]):
        return TransactionType.payment
    return None


def infer_time_window(complaint: str, transactions: list[Transaction]) -> tuple[datetime, datetime] | None:
    text = normalize_text(complaint)
    timestamps = [ts for ts in (parse_timestamp(t.timestamp) for t in transactions) if ts]
    if not timestamps:
        return None
    latest = max(timestamps)
    if "yesterday" in text or "গতকাল" in text:
        start = (latest - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        return start, start + timedelta(days=1)
    if any(word in text for word in ["today", "আজ", "this morning", "সকালে"]):
        return latest.replace(hour=0, minute=0, second=0, microsecond=0), latest + timedelta(seconds=1)
    hour_match = re.search(r"\b(?:around\s*)?(\d{1,2})\s*(?:pm|p\.m\.)\b", text)
    if hour_match:
        hour = int(hour_match.group(1))
        if hour < 12:
            hour += 12
        center = latest.replace(hour=hour, minute=0, second=0, microsecond=0)
        return center - timedelta(hours=2), center + timedelta(hours=2)
    return None


def find_duplicate(transactions: list[Transaction]) -> tuple[Transaction | None, list[str]]:
    groups: dict[tuple[float | None, str | None, TransactionType], list[Transaction]] = {}
    for txn in transactions:
        if txn.amount is None or not txn.counterparty:
            continue
        if txn.type not in {TransactionType.payment, TransactionType.unknown}:
            continue
        groups.setdefault((txn.amount, txn.counterparty, txn.type), []).append(txn)
    best_group: list[Transaction] = []
    for group in groups.values():
        if len(group) >= 2 and len(group) > len(best_group):
            best_group = group
    if not best_group:
        return None, []
    best_group.sort(key=lambda t: parse_timestamp(t.timestamp) or datetime.min.replace(tzinfo=timezone.utc))
    return best_group[-1], ["duplicate_payment", "transaction_match"]


def _score_txn(
    txn: Transaction,
    amounts: list[float],
    counterparties: list[str],
    desired_type: TransactionType | None,
    time_window: tuple[datetime, datetime] | None,
    case_type: CaseType,
) -> tuple[float, list[str]]:
    score = 0.0
    reasons: list[str] = []
    if amounts and txn.amount is not None and any(math.isclose(txn.amount, amount, abs_tol=0.01) for amount in amounts):
        score += 6
        reasons.append("amount_match")
    elif not amounts and txn.amount is not None:
        score += 0.5

    if desired_type and txn.type == desired_type:
        score += 3
        reasons.append("type_match")

    if case_type == CaseType.payment_failed and txn.status == TransactionStatus.failed:
        score += 3
        reasons.append("status_match")
    elif case_type in {CaseType.wrong_transfer, CaseType.refund_request} and txn.status == TransactionStatus.completed:
        score += 2
        reasons.append("status_match")
    elif case_type in {CaseType.agent_cash_in_issue, CaseType.merchant_settlement_delay} and txn.status in {TransactionStatus.pending, TransactionStatus.completed}:
        score += 2
        reasons.append("status_match")

    if counterparties and txn.counterparty and txn.counterparty.lower() in counterparties:
        score += 2
        reasons.append("counterparty_match")

    ts = parse_timestamp(txn.timestamp)
    if time_window and ts and time_window[0] <= ts <= time_window[1]:
        score += 1
        reasons.append("time_match")
    return score, reasons


def _established_counterparty(txn: Transaction, transactions: list[Transaction]) -> bool:
    if not txn.counterparty:
        return False
    count = sum(1 for item in transactions if item.counterparty == txn.counterparty and item.type == txn.type)
    return count >= 2


def match_transaction(complaint: str, case_type: CaseType, transactions: list[Transaction]) -> MatchResult:
    amounts = extract_amounts(complaint)
    if case_type == CaseType.phishing_or_social_engineering:
        return MatchResult(None, EvidenceVerdict.insufficient_data, amounts[0] if amounts else None, 0.95, ["phishing_or_social_engineering"])
    if not transactions:
        return MatchResult(None, EvidenceVerdict.insufficient_data, amounts[0] if amounts else None, 0.35, [case_type.value, "no_transaction_history"])
    if case_type == CaseType.duplicate_payment:
        duplicate, reasons = find_duplicate(transactions)
        if duplicate:
            return MatchResult(duplicate.transaction_id, EvidenceVerdict.consistent, duplicate.amount, 0.92, reasons)

    desired_type = infer_type(case_type, complaint)
    counterparties = extract_counterparties(complaint)
    time_window = infer_time_window(complaint, transactions)

    scored = []
    for txn in transactions:
        if not txn.transaction_id:
            continue
        score, reasons = _score_txn(txn, amounts, counterparties, desired_type, time_window, case_type)
        scored.append((score, txn, reasons))
    scored.sort(key=lambda item: item[0], reverse=True)
    if not scored or scored[0][0] < 3:
        return MatchResult(None, EvidenceVerdict.insufficient_data, amounts[0] if amounts else None, 0.4, [case_type.value, "no_clear_match"])

    top_score = scored[0][0]
    tied = [item for item in scored if math.isclose(item[0], top_score, abs_tol=0.01)]
    if len(tied) > 1 and (amounts or top_score <= 6):
        return MatchResult(None, EvidenceVerdict.insufficient_data, amounts[0] if amounts else None, 0.45, [case_type.value, "ambiguous_match"])

    txn = scored[0][1]
    reasons = [case_type.value, "transaction_match", *scored[0][2]]
    verdict = EvidenceVerdict.consistent
    if case_type == CaseType.wrong_transfer and _established_counterparty(txn, transactions):
        verdict = EvidenceVerdict.inconsistent
        reasons.append("established_counterparty")
    if case_type == CaseType.refund_request and txn.status in {TransactionStatus.reversed, TransactionStatus.failed} and "deduct" in normalize_text(complaint):
        verdict = EvidenceVerdict.inconsistent
        reasons.append("status_contradiction")
    return MatchResult(txn.transaction_id, verdict, txn.amount, min(0.95, 0.5 + top_score / 20), reasons)
