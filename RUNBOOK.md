# QueueStorm Investigator Runbook

## Local Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Start the API

```bash
USE_LLM=false uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Verify

```bash
curl http://localhost:8000/health
pytest
```

## Docker

```bash
docker build -t queuestorm-investigator .
docker run --rm -p 8000:8000 -e USE_LLM=false queuestorm-investigator
```

## Environment

Copy `.env.example` if needed. The deterministic path does not need secrets.

```bash
USE_LLM=false
LLM_PROVIDER=
LLM_API_KEY=
```

## Operational Notes

- `/health` has no dependencies.
- `/analyze-ticket` returns 400 for malformed JSON or missing required fields.
- Empty-but-present complaints return 422.
- Unexpected exceptions return `{"error":"internal error"}` without stack traces or secrets.
