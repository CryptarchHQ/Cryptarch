"""Redis list queue for document ingestion jobs.

Queue name (stable contract for API + worker):
    cryptarch:document_jobs

Each job is a JSON object:
    {"document_id": "<uuid>", "tenant_id": "<uuid>", "file_path": "<path>"}
"""

from __future__ import annotations

import json

import redis
from core.ports.document_job_queue import DocumentJobPayload

# Stable Redis list key consumed by the vectorizer worker.
DOCUMENT_JOB_QUEUE_NAME = "cryptarch:document_jobs"


class RedisDocumentJobQueue:
    """Enqueues document jobs onto a Redis list (RPUSH)."""

    def __init__(
        self, redis_url: str, queue_name: str = DOCUMENT_JOB_QUEUE_NAME
    ) -> None:
        self._client = redis.from_url(redis_url)
        self._queue_name = queue_name

    def enqueue(self, job: DocumentJobPayload) -> None:
        self._client.rpush(self._queue_name, json.dumps(job))
