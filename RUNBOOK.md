# QueueStorm Investigator Runbook

A copy-pasteable setup for judges, operators, and reviewers. The service runs
identically in any of three modes:

1. **Local Python** — preferred for inspection and tweaking.
2. **Docker container** — preferred for reproducible judging.
3. **Render / Railway / Fly** — preferred for live URL submission. Use
   [`render.yaml`](./render.yaml) as the canonical manifest; equivalent
   manifest required for the other two.

---

## 0. Judge quick-start (under 30 seconds)

```bash
# Local Python
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
USE_LLM=false uvicorn app.main:app --host 0.0.0.0 --port 8000 &

# In a second shell — health + smoke
curl -s http://localhost:8000/health
curl -s -X POST http://localhost:8000/analyze-ticket \
  -H 'content-type: application/json' \
  --data '{"ticket_id":"TKT-001","complaint":"I sent 5000 taka to the wrong number today","transaction_history":[{"transaction_id":"TXN-9101","timestamp":"2026-04-14T14:08:22Z","type":"transfer","amount":5000,"counterparty":"+8801719876543","status":"completed"}]}'
```

Or in one shell, run the full test suite (32 cases):

```bash
USE_LLM=false pytest -q
```

---

## 1. Local Setup

Requires Python 3.11+.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

If `pip install` is slow or restricted:

```bash
pip install --only-binary=:all: -r requirements.txt
```

## 2. Start the API

```bash
USE_LLM=false uvicorn app.main:app --host 0.0.0.0 --port 8000
```

To enable the optional LLM polish layer:

```bash
USE_LLM=true \
LLM_PROVIDER=openai-compatible \
LLM_BASE_URL=https://api.openai.com/v1 \
LLM_API_KEY=<your-key> \
LLM_MODEL=gpt-4o-mini \
LLM_TIMEOUT_SECONDS=8 \
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Any failure in the LLM path (timeout, error, unsafe rewrite) silently
falls back to the deterministic engine — the service never breaks.

## 3. Verify

```bash
# Liveness
curl -s http://localhost:8000/health
# => {"status":"ok"}

# Full test suite
USE_LLM=false pytest -q
```

## 4. Docker

```bash
docker build -t queuestorm-investigator .
docker run --rm -p 8000:8000 -e USE_LLM=false queuestorm-investigator
```

The container honors `$PORT` if the host sets one (Render / Railway /
Fly / Heroku-style).

```bash
docker run --rm -p 9000:9000 -e PORT=9000 -e USE_LLM=false queuestorm-investigator
```

## 5. Deploy to Render / Railway / Fly

`render.yaml` is the canonical Render blueprint (free plan, Oregon region,
`USE_LLM=false`, `LLM_TIMEOUT_SECONDS=25`, `healthCheckPath: /health`).
For Railway or Fly, port the same fields to their equivalent manifest — no
code changes required.

## 6. Environment Variables

`app/main.py` reads (no real secrets ever committed):

| Variable             | Default     | Purpose                                                              |
|----------------------|-------------|----------------------------------------------------------------------|
| `USE_LLM`            | `false`     | Master switch for the optional LLM polish layer                      |
| `LLM_PROVIDER`       | (empty)     | Cosmetic label in logs only                                          |
| `LLM_BASE_URL`       | (empty)     | OpenAI-compatible endpoint                                           |
| `LLM_API_KEY`        | (empty)     | Provider key — only used when `USE_LLM=true`                          |
| `LLM_MODEL`          | `gpt-4o-mini` | Model name to request                                                |
| `LLM_TIMEOUT_SECONDS`| `8`         | Hard timeout for the optional LLM call (spec §9 caps total at 30 s)   |
| `PORT`               | `8000`      | HTTP listen port (set automatically on Render / Railway / Fly)       |

Copy the template and edit locally:

```bash
cp .env.example .env
# Edit .env, then:
set -a; source .env; set +a
USE_LLM=false uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The deterministic path needs **none** of these.

## 7. Operational Notes

- `/health` has no dependencies (no DB, no LLM, no auth).
- `/analyze-ticket` returns **400** for malformed JSON or missing required fields.
- `/analyze-ticket` returns **422** for empty / whitespace-only complaints.
- Unexpected exceptions return `{"error":"internal error"}` — no stack traces
  or secrets in the response body, headers, or logs.
- Logs are JSON-line, one line per request, never include the raw complaint
  body or any token.

## 8. Troubleshooting

### 8.1 `ModuleNotFoundError: No module named 'app'`

You are running `uvicorn` from outside the project root. `cd` into the
directory containing `app/` and re-run, or set `PYTHONPATH`:

```bash
PYTHONPATH=. USE_LLM=false uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 8.2 `Address already in use` on port 8000

Find and stop the existing process, or change the port:

```bash
lsof -i :8000 -t | xargs -r kill -9
# or
USE_LLM=false uvicorn app.main:app --host 0.0.0.0 --port 8080
```

### 8.3 `pip install` fails on a managed host (Render / Railway)

Pin Python to 3.11 in `runtime.txt` (Render) or set
`PYTHON_VERSION=3.11.9` in the Railway service variables. The image is
already pinned to `python:3.11-slim` in `Dockerfile`.

### 8.4 Optional LLM call hangs or fails

Expected and safe — the service falls back to the deterministic engine
within `LLM_TIMEOUT_SECONDS` (default 8 s). Check logs for the
`llm_enhance_failed` JSON line; no user-visible impact.

### 8.5 `pytest` fails with `fastapi.testclient` import errors

You are using a Python version older than 3.10. FastAPI 0.110+ requires
Python 3.10+. Upgrade to 3.11 (the project's pinned version).

### 8.6 The customer reply is unexpectedly generic

That is the safety post-processor doing its job. The deterministic engine
and the optional LLM both pass `customer_reply` through `is_text_safe`;
unsafe rewrites are replaced with the safe template. See
[`README.md` §5 Safety Logic](./README.md#5-safety-logic).

## 9. Where to look next

- [`README.md`](./README.md) — overview, AI approach, MODELS, rubric
  self-check.
- `tests/test_samples.py` — the 10 public cases.
- `tests/test_hidden.py` — 22 adversarial / hidden probes.
- `samples/sample_output_SAMPLE-01.json` — a worked example.
