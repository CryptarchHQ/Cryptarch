"""Vectorizer worker: consume document jobs and extract text (phase 1).

Phase 1: status ``indexed`` means text was extracted successfully.
Chunking, embeddings, and Qdrant upsert are out of scope for this phase.

Queue contract (API RPUSH / worker BLPOP):
    Redis list ``cryptarch:document_jobs``
    JSON: {"document_id", "tenant_id", "file_path"}
"""

from __future__ import annotations

import os
import sys

import redis

from job_processor import process_raw_payload
from status_store import PostgresStatusStore

DOCUMENT_JOB_QUEUE_NAME = "cryptarch:document_jobs"
BLPOP_TIMEOUT_SECONDS = 5


def run_forever(
    redis_client: redis.Redis,
    status_store: PostgresStatusStore,
    *,
    queue_name: str = DOCUMENT_JOB_QUEUE_NAME,
    blpop_timeout: int = BLPOP_TIMEOUT_SECONDS,
) -> None:
    """Block on the job queue and process each payload. Never exits on job errors."""
    print("Worker ready — consuming", queue_name, flush=True)
    while True:
        item = redis_client.blpop(queue_name, timeout=blpop_timeout)
        if item is None:
            continue
        _queue, raw = item
        try:
            process_raw_payload(raw, status_store)
        except Exception as exc:  # noqa: BLE001 — loop must not die
            print(f"unexpected worker error (continuing): {exc}", flush=True)


def main() -> None:
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    database_url = os.environ.get(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/appdb"
    )

    try:
        r = redis.from_url(redis_url)
        r.ping()
        print("Worker ready — connected to Redis", flush=True)
    except redis.ConnectionError:
        print("Worker ready — Redis not yet available, will retry via BLPOP", flush=True)
        r = redis.from_url(redis_url)

    status_store = PostgresStatusStore(database_url)
    run_forever(r, status_store)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
