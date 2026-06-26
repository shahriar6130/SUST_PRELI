from __future__ import annotations

import os

from app.schemas import AnalyzeTicketResponse


async def maybe_enhance(response: AnalyzeTicketResponse, complaint: str) -> AnalyzeTicketResponse:
    if os.getenv("USE_LLM", "false").strip().lower() not in {"1", "true", "yes"}:
        return response
    # Optional provider integration intentionally fails closed. The deterministic
    # answer is complete and safe without network access or API keys.
    if not os.getenv("LLM_API_KEY"):
        return response
    return response
