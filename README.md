# QueueStorm Investigator API

A production-clean FastAPI service that classifies, routes, and investigates
digital-finance support complaints. Given one customer complaint plus a short
transaction-history snippet, it returns one structured JSON verdict that
classifies the case, picks the relevant transaction, judges whether the
evidence is consistent with the complaint, and drafts a safe customer reply.

Built for the SUST Prelim Codex Community Hackathon — judge runs `GET /health`
and `POST /analyze-ticket`.

---

## 1. Setup and Run

### Local

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
USE_LLM=false uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Docker

```bash
docker build -t queuestorm-investigator .
docker run --rm -p 8000:8000 -e USE_LLM=false queuestorm-investigator
```

The container honors `$PORT` if the host platform sets one (Render, Railway,
Fly, Heroku-style).

### Verify

```bash
curl -s http://localhost:8000/health
curl -X POST http://localhost:8000/analyze-ticket \
  -H 'content-type: application/json' \
  -d '{"ticket_id":"TKT-001","complaint":"I sent 5000 taka to the wrong number today","transaction_history":[{"transaction_id":"TXN-9101","timestamp":"2026-04-14T14:08:22Z","type":"transfer","amount":5000,"counterparty":"+8801719876543","status":"completed"}]}'
```

### Tests

```bash
pytest -v
```

The suite covers the 10 public sample cases plus 20 hidden-case adversarial
probes (injection, contradictory amounts, Bangla digits, ambiguous ties,
performance SLA, schema shape).

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Python 3.11 | Stable, fast cold start |
| HTTP | FastAPI + Uvicorn | Async, OpenAPI, Pydantic v2 native |
| Validation | Pydantic v2 | Strict enums, schema-validated request/response |
| LLM (optional) | httpx | Async with hard timeout, fail-closed |
| Tests | pytest | Lightweight, fast |
| Container | `python:3.11-slim` | < 300 MB image |

No GPU, no baked-in models, no vector store, no database.

---

## 3. AI Approach

**Rules-engine-first.** The default path is a deterministic rules engine that
performs language detection, case-type classification, transaction matching,
evidence verdicts, routing, severity, and safe reply templating — without any
external API call or model load. This was chosen for judge reliability,
reproducibility, low latency, and zero runtime cost.

**Optional guarded LLM.** When `USE_LLM=true` is set, the service may call an
external OpenAI-compatible JSON-mode model behind `LLM_BASE_URL` and
`LLM_API_KEY`. The LLM is **only allowed to rewrite `agent_summary` and
`customer_reply`** — it never sees structured decisions and cannot change the
verdict, case type, severity, or department. Every rewrite is re-checked
against the safety filter. Any exception, timeout (> 8 s, per spec §9), parse
error, or unsafe rewrite silently falls back to the deterministic output.
**No API key is required to run or to pass tests.**

---

## 4. MODELS

| Model | Where it runs | Purpose | Required? |
|---|---|---|---|
| Deterministic rules engine | In-process Python | Classification, matching, evidence verdicts, routing, severity, human-review flags, safe replies | **Yes** — required path |
| Optional external LLM (`LLM_MODEL`, default `gpt-4o-mini`) | Provider via `LLM_BASE_URL` | Rewrites `agent_summary` and `customer_reply` only | No — disabled by default; falls back to deterministic |

No fine-tuned weights, no embeddings, no vector database. The deterministic
engine is the entire product; the LLM is a polish layer that can be removed
without changing any structured decision.

---

## 5. Safety Logic

Customer replies are template-based and then post-processed by `app/safety.py`.
The safety layer enforces, in order:

1. **No credential requests** — regex blocks any phrasing that asks the
   customer to share, send, give, confirm, verify, enter, type, or submit
   their PIN, OTP, password, CVV, full card number, or passcode.
2. **No refund or reversal promises** — refund / reversal / unblock promises
   are stripped and rewritten to "any eligible amount will be returned
   through official channels".
3. **No third-party referrals** — phone numbers (5+ digits), URLs, WhatsApp,
   Telegram, Viber, iMessage, IMO, Signal, or "call/contact/dial" instructions
   to non-official endpoints are blocked. Replies redirect only to "official
   support channels".
4. **Prompt-injection resistance** — customer complaint text is scanned for
   injection phrases ("ignore previous instructions", "you are now", "set
   case_type", etc.). Injected phrases are stripped from the complaint before
   classification and from all response fields before output. The LLM path
   never sees the complaint directly — only a sanitized language hint.

`recommended_next_action` is also safety-scanned. If a generated next-step
fails safety, it collapses to a fixed safe action.

Adversarial tests in `tests/test_hidden.py` assert these rules against four
canonical phishing/credential-leak patterns.

---

## 6. Evidence Reasoning

The matcher extracts amounts (numeric, Bangla digits, English amount words,
Bangla amount words), counterparty hints (phone numbers, agent IDs, merchant
IDs), transaction-type hints, and coarse time windows (yesterday, today,
"around 2pm"). Each transaction is scored by:

- Exact amount match (+6)
- Type match (+3)
- Status match (+2-3 depending on case)
- Counterparty match (+2)
- Time window match (+1)

Top-scored transaction is chosen; ties at the top with ambiguous amounts
return `evidence_verdict = insufficient_data` with `relevant_transaction_id =
null`.

**Contradiction rules** (in addition to scoring):

- If the matched transaction's amount differs from every amount in the
  complaint → `evidence_verdict = inconsistent` (`reason_code:
  amount_contradiction`).
- If the matched transaction's status directly contradicts the complaint
  claim (e.g. customer says "deducted" but `status == reversed`, or claim is
  payment_failed but `status == completed`) → `inconsistent`
  (`status_contradiction`).
- Repeated prior transfers to the same recipient on a wrong-transfer claim →
  `inconsistent` (`established_counterparty`).

Ambiguous ties produce `insufficient_data`, never a confident guess.

---

## 7. Assumptions

- English, Bangla, and Banglish complaint text are supported. Mixed-script
  amounts (Bangla digits like ২০০০) are normalized to ASCII before matching.
- Time reasoning uses the latest transaction timestamp as the reference
  point, since the request does not include a server clock. Hidden cases
  with explicit "today" or "yesterday" keywords are interpreted relative to
  that anchor.
- The complaint's first significant amount is used when no specific amount
  is in the transaction history.
- `metadata` and unknown JSON fields are tolerated but not used in
  reasoning (Pydantic `extra="allow"`).

---

## 8. Known Limitations

- The rules engine uses keyword matching, not a statistical classifier.
  Rare synonyms or paraphrases may fall back to `other` /
  `insufficient_data`.
- Duplicate detection is structural (same amount + counterparty + type
  repeated); two-leg transfers across different merchants are not flagged
  as duplicates.
- The optional LLM provider must be OpenAI-compatible (JSON-mode). Other
  providers need adapter code.
- The service is single-container; horizontal scaling requires a stateless
  deployment (the engine is fully in-memory).

---

## 9. Cost Reasoning

- **Deterministic path:** ~$0 per request beyond hosting. No external calls,
  no model load, no tokens billed.
- **Optional LLM path:** Billed per provider token rate. `LLM_TIMEOUT_SECONDS`
  defaults to 8 s (spec §9) and any timeout, error, or unsafe rewrite silently
  falls back to the deterministic output, so a flaky provider cannot degrade
  schema or safety.
- **Hosting:** A single 2 vCPU / 4 GB VM or Render / Railway free tier is
  sufficient for the planned request volume.

---

## 10. Submission

| Path | Status |
|---|---|
| A. Live URL | Replace with deployed URL after Render / Railway / Fly deploy |
| B. Docker | Skipped — service runs as a native Python app via `render.yaml`. A `Dockerfile` is included in the repo for judges who prefer container execution: `docker build -t queuestorm-investigator . && docker run --rm -p 8000:8000 -e USE_LLM=false queuestorm-investigator` |
| C. Runbook | See [`RUNBOOK.md`](./RUNBOOK.md) |

When the judge harness calls `GET /health` it must return
`{"status":"ok"}` within 60 seconds of service start, and every
`POST /analyze-ticket` must complete within 30 seconds.

---

## 11. API Contract (Quick Reference)

### Request

```json
{
  "ticket_id": "TKT-001",
  "complaint": "I sent 5000 taka to a wrong number around 2pm today.",
  "language": "en",
  "channel": "in_app_chat",
  "user_type": "customer",
  "campaign_context": "boishakh_bonanza_day_1",
  "transaction_history": [
    {
      "transaction_id": "TXN-9101",
      "timestamp": "2026-04-14T14:08:22Z",
      "type": "transfer",
      "amount": 5000,
      "counterparty": "+8801719876543",
      "status": "completed"
    }
  ]
}
```

### Response

```json
{
  "ticket_id": "TKT-001",
  "relevant_transaction_id": "TXN-9101",
  "evidence_verdict": "consistent",
  "case_type": "wrong_transfer",
  "severity": "high",
  "department": "dispute_resolution",
  "agent_summary": "...",
  "recommended_next_action": "...",
  "customer_reply": "...",
  "human_review_required": true,
  "confidence": 0.92,
  "reason_codes": ["wrong_transfer", "transaction_match", "amount_match"]
}
```

### Error Codes

| Code | Trigger |
|---|---|
| 200 | Successful analysis |
| 400 | Malformed JSON or missing required field |
| 422 | Schema valid but complaint is empty / whitespace |
| 500 | Internal error — no stack traces, no secrets |
