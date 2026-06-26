from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Language(str, Enum):
    en = "en"
    bn = "bn"
    mixed = "mixed"


class Channel(str, Enum):
    in_app_chat = "in_app_chat"
    call_center = "call_center"
    email = "email"
    merchant_portal = "merchant_portal"
    field_agent = "field_agent"
    unknown = "unknown"


class UserType(str, Enum):
    customer = "customer"
    merchant = "merchant"
    agent = "agent"
    unknown = "unknown"


class TransactionType(str, Enum):
    transfer = "transfer"
    payment = "payment"
    cash_in = "cash_in"
    cash_out = "cash_out"
    settlement = "settlement"
    refund = "refund"
    unknown = "unknown"


class TransactionStatus(str, Enum):
    completed = "completed"
    failed = "failed"
    pending = "pending"
    reversed = "reversed"
    unknown = "unknown"


class EvidenceVerdict(str, Enum):
    consistent = "consistent"
    inconsistent = "inconsistent"
    insufficient_data = "insufficient_data"


class CaseType(str, Enum):
    wrong_transfer = "wrong_transfer"
    payment_failed = "payment_failed"
    duplicate_payment = "duplicate_payment"
    refund_request = "refund_request"
    merchant_settlement_delay = "merchant_settlement_delay"
    agent_cash_in_issue = "agent_cash_in_issue"
    phishing_or_social_engineering = "phishing_or_social_engineering"
    other = "other"


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class Department(str, Enum):
    dispute_resolution = "dispute_resolution"
    payments_ops = "payments_ops"
    customer_support = "customer_support"
    merchant_operations = "merchant_operations"
    agent_operations = "agent_operations"
    fraud_risk = "fraud_risk"


def _coerce_enum(value: Any, enum_cls: type[Enum], default: Enum) -> Enum:
    if value is None:
        return default
    try:
        return enum_cls(str(value))
    except Exception:
        return default


class Transaction(BaseModel):
    model_config = ConfigDict(extra="allow")

    transaction_id: str | None = None
    timestamp: str | None = None
    type: TransactionType = TransactionType.unknown
    amount: float | None = None
    counterparty: str | None = None
    status: TransactionStatus = TransactionStatus.unknown

    @field_validator("transaction_id", "timestamp", "counterparty", mode="before")
    @classmethod
    def coerce_optional_string(cls, value: Any) -> str | None:
        if value is None:
            return None
        return str(value)

    @field_validator("type", mode="before")
    @classmethod
    def coerce_type(cls, value: Any) -> TransactionType:
        return _coerce_enum(value, TransactionType, TransactionType.unknown)

    @field_validator("status", mode="before")
    @classmethod
    def coerce_status(cls, value: Any) -> TransactionStatus:
        return _coerce_enum(value, TransactionStatus, TransactionStatus.unknown)

    @field_validator("amount", mode="before")
    @classmethod
    def coerce_amount(cls, value: Any) -> float | None:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except Exception:
            return None


class AnalyzeTicketRequest(BaseModel):
    model_config = ConfigDict(
        extra="allow",
        json_schema_extra={
            "example": {
                "ticket_id": "TKT-001",
                "complaint": "I sent 5000 taka to the wrong number today",
                "language": "en",
                "channel": "in_app_chat",
                "user_type": "customer",
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
                "metadata": {},
            }
        },
    )

    ticket_id: str
    complaint: str
    language: Language | None = None
    channel: Channel = Channel.unknown
    user_type: UserType = UserType.customer
    campaign_context: str | None = None
    transaction_history: list[Transaction] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("ticket_id", "complaint", mode="before")
    @classmethod
    def coerce_required_string(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value)

    @field_validator("language", mode="before")
    @classmethod
    def coerce_language(cls, value: Any) -> Language | None:
        if value is None:
            return None
        return _coerce_enum(value, Language, Language.mixed)

    @field_validator("channel", mode="before")
    @classmethod
    def coerce_channel(cls, value: Any) -> Channel:
        return _coerce_enum(value, Channel, Channel.unknown)

    @field_validator("user_type", mode="before")
    @classmethod
    def coerce_user_type(cls, value: Any) -> UserType:
        return _coerce_enum(value, UserType, UserType.customer)

    @field_validator("transaction_history", mode="before")
    @classmethod
    def coerce_transaction_history(cls, value: Any) -> list[Any]:
        return value if isinstance(value, list) else []

    @field_validator("metadata", mode="before")
    @classmethod
    def coerce_metadata(cls, value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}


class AnalyzeTicketResponse(BaseModel):
    ticket_id: str
    relevant_transaction_id: str | None
    evidence_verdict: EvidenceVerdict
    case_type: CaseType
    severity: Severity
    department: Department
    agent_summary: str
    recommended_next_action: str
    customer_reply: str
    human_review_required: bool
    confidence: float | None = Field(default=None, ge=0, le=1)
    reason_codes: list[str] | None = None
