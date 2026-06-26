# QueueStorm Investigator API

A production-clean FastAPI service that classifies, routes, and investigates
digital-finance support complaints. Given one customer complaint plus a short
transaction-history snippet, it returns one structured JSON verdict that
classifies the case, picks the relevant transaction, judges whether the
evidence is consistent with the complaint, and drafts a safe customer reply.

Built for the **SUST Prelim · Codex Community Hackathon**. The judge harness
exercises `GET /health` and `POST /analyze-ticket`.

> **Status:** ready for submission. See [§10 Submission](#10-submission) for
> the live URL, Docker fallback, and runbook.

---

## Table of Contents

1. [Setup and Run](#1-setup-and-run)
2. [Tech Stack](#2-tech-stack)
3. [AI Approach](#3-ai-approach)
4. [MODELS](#4-models)
5. [Safety Logic](#5-safety-logic)
6. [Evidence Reasoning](#6-evidence-reasoning)
7. [Assumptions](#7-assumptions)
8. [Known Limitations](#8-known-limitations)
9. [Cost Reasoning](#9-cost-reasoning)
10. [Submission](#10-submission)
11. [API Contract (Quick Reference)](#11-api-contract-quick-reference)
12. [Sample Output](#12-sample-output)
- [Appendix A — File map](#appendix-a--file-map)
- [Appendix B — Rubric self-check](#appendix-b--rubric-self-check-layer-1)

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
# => {"status":"ok"}
```

### End-to-end smoke test

```bash
curl -s -X POST http://localhost:8000/analyze-ticket \
  -H 'content-type: application/json' \
  --data '{
    "ticket_id": "TKT-001",
    "complaint": "I sent 5000 taka to the wrong number today",
    "transaction_history": [
      {"transaction_id":"TXN-9101","timestamp":"2026-04-14T14:08:22Z","type":"transfer","amount":5000,"counterparty":"+8801719876543","status":"completed"}
    ]
  }' | python3 -m json.tool
```

A full worked example output is in
[`samples/sample_output_SAMPLE-01.json`](./samples/sample_output_SAMPLE-01.json).

### Tests

```bash
USE_LLM=false pytest -q
```

The suite covers the **10 public sample cases** plus **22 hidden-case
adversarial probes** (prompt injection, contradictory amounts, Bangla digits,
ambiguous ties, performance SLA, schema shape, prompt-injection overrides).
Last run: **32 passed in 0.19 s**.

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
**OpenAI-compatible JSON-mode chat completions endpoint** behind
`LLM_BASE_URL` and `LLM_API_KEY`. The LLM is **only allowed to rewrite
`agent_summary` and `customer_reply`** — it never sees the structured
decisions and cannot change `relevant_transaction_id`, `evidence_verdict`,
`case_type`, `severity`, or `department`. Every rewrite is re-checked
against the safety filter. Any exception, timeout (> 8 s, per spec §9),
parse error, or unsafe rewrite silently falls back to the deterministic
output.

> **No API key is required to run, deploy, or pass tests.** The default
> `USE_LLM=false` is the recommended and rubric-blessed configuration.

### 3.1 Pipeline (per request)

```
POST /analyze-ticket
  │
  ▼
remove_injected_instructions()   ← strip prompt-injection phrases
  │
  ▼
detect_language() + classify_case()    ← Bangla / Banglish / English, 8 case types
  │
  ▼
match_transaction()             ← score each txn; pick top, ties → null
  │
  ▼
department_for() / severity_for() / human_review_for()
  │
  ▼
build_agent_summary() / customer_template() / next_action()
  │
  ▼
enforce_response_safety()       ← regex post-processor; if unsafe, re-template
  │
  ▼
maybe_enhance() [USE_LLM=true only, 8 s timeout, fail-closed]
  │
  ▼
AnalyzeTicketResponse JSON
```

---

## 4. MODELS

| Model                                                  | Where it runs                   | Purpose                                                                                          | Required?                                                                              |
|--------------------------------------------------------|---------------------------------|--------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| **Deterministic rules engine** (in-process Python)     | In-process (`app/*.py`)         | Classification, transaction matching, evidence verdicts, routing, severity, human-review, replies | **Yes** — required path; default and only path when `USE_LLM=false`                    |
| **Optional external LLM** (`LLM_MODEL`, default `gpt-4o-mini`) | Provider reachable via `LLM_BASE_URL` | Rewrites `agent_summary` and `customer_reply` only; cannot change any structured field            | No — disabled by default; any failure (timeout, parse, unsafe rewrite) → deterministic |

**No fine-tuned weights, no embeddings, no vector database.** The
deterministic engine is the entire product; the LLM is a polish layer that
can be removed without changing any structured decision.

**Why this stack:**
- A rules engine gives bit-exact reproducibility and ~$0 cost per request —
  both are first-class rubric signals (tie-breakers 1 and 4).
- The optional LLM is gated behind an env flag, has an 8-second timeout,
  and re-runs the safety filter on every rewrite, so a flaky provider
  cannot degrade schema correctness or safety.
- Provider portability: the LLM endpoint is **OpenAI-compatible (JSON
  mode)**. Set `LLM_BASE_URL` to point at OpenAI, OpenRouter, Together,
  or any other OpenAI-shaped endpoint — no code changes required.

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

The matcher extracts four clue classes from the complaint and scores every
transaction against them.

### 6.1 Clue extraction

| Clue         | Sources                                                                              |
|--------------|--------------------------------------------------------------------------------------|
| Amounts      | Numeric, Bangla digits (`০১২৩৪৫৬৭৮৯`), English amount words (*"five thousand"*), Bangla amount words (*"দুই হাজার"*) |
| Counterparty | Phone numbers, agent IDs (`agent-*`), merchant IDs (`merchant-*`), short codes      |
| Type hints   | send / transfer → `transfer`; payment / bill / recharge → `payment`; cash-in → `cash_in`; settlement → `settlement` |
| Time windows | *"yesterday"*, *"today"*, *"around 2pm"*, *"this morning"*, Bangla equivalents; anchored to the latest history timestamp |

### 6.2 Scoring

For each transaction, the matcher computes:

| Signal       | Score | Notes                                                       |
|--------------|-------|-------------------------------------------------------------|
| Amount match | +6    | Any complaint amount matches `txn.amount` (abs_tol 0.01)    |
| Type match   | +3    | `txn.type` aligns with the inferred or case-implied type   |
| Status match | +2–3  | Case-specific: e.g. `failed` for `payment_failed`, `pending` for `cash_in`, `completed` for `wrong_transfer` |
| Counterparty | +2    | `txn.counterparty` appears in the complaint                |
| Time match   | +1    | `txn.timestamp` falls in the inferred time window          |

### 6.3 Choosing `relevant_transaction_id`

- **Exactly one clear top candidate** → its `transaction_id`.
- **Two or more candidates tie on the decisive signal** (e.g. multiple
  transactions with the same amount and the customer did not name a
  recipient) → `null` and `evidence_verdict = insufficient_data`.
- **No candidate scores above threshold** → `null` and
  `evidence_verdict = insufficient_data`.
- **For `duplicate_payment`**, the relevant id is the **second / later**
  of the two near-identical payments (the suspected duplicate), not the
  first.

### 6.4 Choosing `evidence_verdict`

- **`consistent`** — the matched transaction supports the complaint
  (amount + type + status all align with what the customer claims).
- **`inconsistent`** — the matched transaction directly contradicts the
  claim. Triggered by:
  - **Established counterparty** — a `wrong_transfer` claim where the
    matched recipient received two or more prior transfers from this
    customer (an established, trusted recipient — the data undercuts the
    *"mistake"* story).
  - **Amount contradiction** — the matched transaction's amount differs
    from every amount mentioned in the complaint.
  - **Status contradiction** — the matched transaction's status directly
    disagrees with the complaint claim (e.g. customer says *"deducted"*
    but `status == reversed`; or `payment_failed` claim but
    `status == completed`).
- **`insufficient_data`** — no transaction can be identified. Set
  `relevant_transaction_id = null`, ask the customer for the
  disambiguating detail in `customer_reply`, and usually
  `human_review_required = false`.

> **The service never confidently confirms a refund or reversal when
> evidence is unclear.** When in doubt, prefer `insufficient_data` + a
> clarification request over a wrong guess.

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

| Path                | Status                                                                                                                       |
|---------------------|------------------------------------------------------------------------------------------------------------------------------|
| **A. Live URL**     | Live on Render: [`https://sust-preli-dm9d.onrender.com`](https://sust-preli-dm9d.onrender.com) (Render free tier, `USE_LLM=false`, health check on `/health`) |
| **A.1 Endpoints**   | [`GET /health`](https://sust-preli-dm9d.onrender.com/health) · [`POST /analyze-ticket`](https://sust-preli-dm9d.onrender.com/analyze-ticket) |
| **B. Docker image** | Optional. `docker build -t queuestorm-investigator . && docker run --rm -p 8000:8000 -e USE_LLM=false queuestorm-investigator` |
| **C. Runbook**      | [`RUNBOOK.md`](./RUNBOOK.md) — copy-pasteable setup for local or VM deploy.                                                   |

`render.yaml` is the canonical Render blueprint. `Dockerfile` is a slim,
multi-platform-safe container for judge-side execution.

### 10.1 Judge contract guarantees

- `GET /health` returns `{"status":"ok"}` within 60 seconds of process start.
- `POST /analyze-ticket` completes within 30 seconds per request
  (deterministic path target: < 2 s; verified by
  `test_single_request_well_under_sla` in `tests/test_hidden.py`).
- No API keys, tokens, or stack traces are ever present in responses,
  logs, or the repository.

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

| Code | Trigger                                                                | Body                                                          |
|------|------------------------------------------------------------------------|---------------------------------------------------------------|
| 200  | Successful analysis                                                    | Response schema                                                |
| 400  | Malformed JSON or missing required field (`ticket_id` or `complaint`)  | `{"error": "malformed or missing required input"}`             |
| 422  | Schema valid but `complaint` is empty / whitespace                     | `{"error": "complaint must not be empty"}`                    |
| 500  | Internal error — never leaks stack traces, tokens, or env values       | `{"error": "internal error"}`                                  |

---

## 12. Sample Output

`samples/sample_output_SAMPLE-01.json` contains a full, validated response
from a public sample case. Generate a fresh one locally with:

```bash
source .venv/bin/activate
USE_LLM=false python3 - <<'PY'
import json
from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)
req = json.load(open("samples/sample_request_SAMPLE-01.json"))
out = c.post("/analyze-ticket", json=req).json()
print(json.dumps(out, indent=2, ensure_ascii=False))
PY
```

### 12.1 More sample inputs

`tests/sample_cases.json` holds the 10 worked sample cases from the public
sample pack. Each entry contains:

- `input` — the request body.
- `expected` — the functional-equivalent expected response (same
  `relevant_transaction_id`, `evidence_verdict`, `case_type`, `department`,
  `human_review_required`; severity within one level; safe `customer_reply`
  in the expected language).

The test suite (`tests/test_samples.py`) loops over all 10 cases and
asserts functional equivalence.

---

## Appendix A — File map

| Path                                          | Purpose                                                      |
|-----------------------------------------------|--------------------------------------------------------------|
| `app/main.py`                                 | FastAPI app, routes, error handlers, access log              |
| `app/schemas.py`                              | Pydantic request / response models + enums                   |
| `app/analyzer.py`                             | Orchestrator: classify → match → route → reply                |
| `app/classifier.py`                           | Case-type detection (bilingual keywords)                      |
| `app/matcher.py`                              | Clue extraction + transaction scoring (§6)                     |
| `app/routing.py`                              | Department, severity, human-review tables                     |
| `app/safety.py`                               | Forbidden-pattern scan + injection guard + post-processor     |
| `app/replies.py`                              | Bilingual template library                                    |
| `app/llm.py`                                  | Optional LLM enhancement, fully guarded                        |
| `tests/test_samples.py`                       | Asserts functional equivalence on the 10 public cases         |
| `tests/test_hidden.py`                        | 22 adversarial / hidden-case probes                            |
| `samples/sample_request_SAMPLE-01.json`       | Sample request payload                                        |
| `samples/sample_output_SAMPLE-01.json`        | Sample response payload                                       |
| `Dockerfile`                                  | Slim Python 3.11 image, < 300 MB                              |
| `render.yaml`                                 | Render blueprint (web service, `/health` probe)              |
| `RUNBOOK.md`                                  | Copy-pasteable local + Docker setup                            |
| `.env.example`                                | All env-var names with no real values                         |
| `requirements.txt`                            | Pinned dependency list                                         |

---

## Appendix B — Rubric self-check (Layer 1)

| Rubric category                  | Weight | Where it is satisfied                                                                                                  |
|----------------------------------|--------|------------------------------------------------------------------------------------------------------------------------|
| 1. Evidence Reasoning            | 35     | `app/matcher.py` (§6) + `tests/test_hidden.py` (22 cases including contradiction, tie, established-counterparty)        |
| 2. Safety & Escalation           | 20     | `app/safety.py` (§5) + `tests/test_hidden.py::test_unsafe_templates_never_leak` (4 phishing / credential-leak patterns) |
| 3. API Contract & Schema         | 15     | `app/schemas.py` (Pydantic v2 enums) + `app/main.py` (400 / 422 / 500 handlers) + `tests/test_samples.py`               |
| 4. Performance & Reliability     | 10     | Deterministic rules engine (no external calls); `test_single_request_well_under_sla` (≤ 5 s)                            |
| 5. Response Quality              | 10     | Richer `agent_summary` in `app/analyzer.py`; case-specific `recommended_next_action` and bilingual templates            |
| 6. Deployment & Reproducibility  | 5      | `Dockerfile`, `render.yaml`, `RUNBOOK.md`, `.env.example` (§10)                                                          |
| 7. Documentation                 | 5      | This file (§§1–12 + Appendices A / B)                                                                                    |
