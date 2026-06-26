"""Rubric §10 guard: no stack traces or secrets in logs or response bodies.

Build prompt §10 says: "Unexpected exceptions return
`{'error':'internal error'}` without stack traces or secrets."

This test forces a 500 and asserts that:
  1. The HTTP body is `{"error": "internal error"}`.
  2. The captured log records contain neither a Python traceback nor
     any path-looking substring (`File "..."`) and no API-key-shaped
     token.
"""
from __future__ import annotations

import logging
import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> TestClient:
    # Ensure deterministic path so a real LLM is never contacted during this test.
    os.environ["USE_LLM"] = "false"
    from app.main import app  # imported lazily so env is set first
    return TestClient(app)


def test_internal_error_does_not_leak_traceback(client, monkeypatch, caplog):
    """Force /analyze-ticket to raise inside the handler, then assert the
    log capture contains no traceback and the body is the safe error."""

    from app import main as main_module

    async def _raise(*_args, **_kwargs):
        raise RuntimeError("synthetic boom from test")

    # Patch `analyze` (the coroutine called inside the route) to raise.
    monkeypatch.setattr(main_module, "analyze", _raise)

    caplog.set_level(logging.ERROR)
    resp = client.post(
        "/analyze-ticket",
        json={"ticket_id": "TKT-HYGIENE", "complaint": "hello", "transaction_history": []},
    )

    # 1) Body must be the safe envelope — no traceback, no exception class names.
    assert resp.status_code == 500
    body = resp.json()
    assert body == {"error": "internal error"}
    text = resp.text
    assert "Traceback" not in text
    assert "RuntimeError" not in text
    assert "synthetic boom" not in text  # the raised message must not leak

    # 2) Captured log records must not contain a traceback or file path.
    joined = "\n".join(r.getMessage() for r in caplog.records)
    assert "Traceback" not in joined
    assert 'File "' not in joined  # tracebacks include `File "/path/to.py", line N`
    # Exception type name in the log is fine; the actual *traceback* is not.
    # We also forbid secret-looking substrings (Bearer tokens, hex keys).
    assert "Bearer " not in joined
    assert "sk-" not in joined  # common OpenAI key prefix
