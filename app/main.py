from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.analyzer import analyze
from app.schemas import AnalyzeTicketRequest


app = FastAPI(title="QueueStorm Investigator API", version="1.0.0")


@app.exception_handler(RequestValidationError)
async def request_validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error": "malformed or missing required input"})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze-ticket")
async def analyze_ticket(ticket: AnalyzeTicketRequest):
    try:
        if not ticket.complaint.strip():
            return JSONResponse(status_code=422, content={"error": "complaint must not be empty"})
        result = await analyze(ticket)
        return result.model_dump(mode="json")
    except Exception:
        return JSONResponse(status_code=500, content={"error": "internal error"})
