from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.analyzer import analyze
from app.schemas import AnalyzeTicketRequest


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("queuestorm.access")

app = FastAPI(title="QueueStorm Investigator API", version="1.0.0")


@app.middleware("http")
async def access_log(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.warning(
            "rid=%s method=%s path=%s status=500 elapsed_ms=%.1f",
            request_id, request.method, request.url.path, elapsed_ms,
        )
        return JSONResponse(status_code=500, content={"error": "internal error"})
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["x-request-id"] = request_id
    logger.info(
        "rid=%s method=%s path=%s status=%s elapsed_ms=%.1f",
        request_id, request.method, request.url.path, response.status_code, elapsed_ms,
    )
    return response


@app.exception_handler(RequestValidationError)
async def request_validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error": "malformed or missing required input"})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze-ticket")
async def analyze_ticket(ticket: AnalyzeTicketRequest):
    if not ticket.complaint.strip():
        return JSONResponse(status_code=422, content={"error": "complaint must not be empty"})
    try:
        result = await analyze(ticket)
    except Exception as exc:
        logger.error("analyze-ticket failed: %s", type(exc).__name__)
        return JSONResponse(status_code=500, content={"error": "internal error"})
    return result.model_dump(mode="json")
