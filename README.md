# QueueStorm Investigator API

Production-clean FastAPI service for classifying and routing digital-finance support complaints.

## Tech Stack

- Python 3.11
- FastAPI
- Pydantic v2
- Uvicorn
- Pytest

## Run Locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

Analyze a ticket:

```bash
curl -X POST http://localhost:8000/analyze-ticket \
  -H 'content-type: application/json' \
  -d '{"ticket_id":"TKT-001","complaint":"I sent 5000 taka to the wrong number today","transaction_history":[{"transaction_id":"TXN-9101","timestamp":"2026-04-14T14:08:22Z","type":"transfer","amount":5000,"counterparty":"+8801719876543","status":"completed"}]}'
```

## Docker

```bash
docker build -t queuestorm-investigator .
docker run --rm -p 8000:8000 -e USE_LLM=false queuestorm-investigator
```

The container honors `PORT` when set by a host platform.

## AI Approach

The API is deterministic by default. A rules engine handles classification, transaction matching, evidence verdicts, routing, severity, human-review flags, and safe replies without network calls or model credits. This is chosen for judge reliability, low latency, reproducibility, and safety.

An optional LLM layer exists behind `USE_LLM=true`, but it is deliberately guarded and off by default. It may only polish text fields and must never change structured decisions. If credentials are absent or anything fails, the deterministic response is returned.

## MODELS

- Deterministic rules engine: runs locally in Python, required path, no model required.
- Optional external LLM: disabled by default, configured only through `USE_LLM`, `LLM_PROVIDER`, and `LLM_API_KEY`. No provider call is required to run or pass tests.

## Evidence Reasoning

The matcher extracts amounts, Bangla digits, simple amount words, counterparty hints, transaction type hints, and coarse time windows. Each transaction receives a score based on exact amount, type, status, time, and counterparty. Ambiguous ties return `insufficient_data` with a null transaction ID. Duplicate payments return the second/later matching transaction. Repeated prior transfers to the same recipient can make a wrong-transfer claim inconsistent.

## Safety Logic

Customer replies are template-based and then post-processed. The safety layer blocks credential requests, refund or reversal promises, external links, non-official channel redirects, and prompt-injection echoes. Replies use official-channel wording and include PIN/OTP warnings where appropriate. Bangla complaints receive Bangla customer-facing replies for covered templates.

## Assumptions and Limitations

The system uses deterministic keyword and structure rules rather than a statistical classifier. It handles common English, Bangla, and Banglish wording, but rare synonyms may fall back to `other` or `insufficient_data`. Time reasoning is coarse because the request does not include a reliable current timestamp; the latest transaction timestamp is treated as the reference point.

## Cost

The default path costs approximately `$0` per request beyond hosting. It makes no external API calls and loads no model.

## Tests

```bash
pytest
```
