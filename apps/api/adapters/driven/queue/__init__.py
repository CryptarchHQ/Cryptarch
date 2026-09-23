"""Driven adapters for queues (Redis, etc.).

Document ingestion jobs use Redis list ``cryptarch:document_jobs``
(constant ``DOCUMENT_JOB_QUEUE_NAME`` in ``redis_document_job_queue``).
"""
