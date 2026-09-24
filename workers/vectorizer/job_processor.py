"""Process a single document ingestion job (testable, no Redis/Postgres).

Phase 1: status ``indexed`` means text was extracted successfully.
Chunking, embeddings, and Qdrant upsert are out of scope for this phase.
"""

from __future__ import annotations

import json
from typing import Any

from extraction import ExtractionError, extract_text
from status_store import StatusStore

STATUS_PROCESSING = "processing"
STATUS_INDEXED = "indexed"
STATUS_ERROR = "error"

REQUIRED_JOB_KEYS = frozenset({"document_id", "tenant_id", "file_path"})


def process_job(job: dict[str, Any], status_store: StatusStore) -> None:
    """Run extraction for one job: processing → indexed | error.

    Idempotent at status level: reprocessing sets processing again, then
    indexed or error. Does not re-enqueue the job.
    """
    document_id = str(job["document_id"])
    file_path = str(job.get("file_path") or "")

    status_store.set_status(document_id, STATUS_PROCESSING)

    try:
        extract_text(file_path)
    except ExtractionError as exc:
        print(f"document {document_id} extraction failed: {exc}", flush=True)
        status_store.set_status(document_id, STATUS_ERROR)
        return

    status_store.set_status(document_id, STATUS_INDEXED)


def process_raw_payload(raw: bytes | str, status_store: StatusStore) -> None:
    """Parse queue payload and process; never raises (malformed jobs are logged)."""
    try:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        job = json.loads(raw)
        if not isinstance(job, dict):
            raise ValueError("job payload must be a JSON object")
        missing = REQUIRED_JOB_KEYS - job.keys()
        if missing:
            raise ValueError(f"missing keys: {sorted(missing)}")
        process_job(job, status_store)
    except Exception as exc:  # noqa: BLE001 — keep worker loop alive
        print(f"malformed or failed job ignored: {exc}", flush=True)
