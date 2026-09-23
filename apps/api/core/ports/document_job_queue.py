"""Port for enqueueing document ingestion jobs."""

from typing import Protocol, TypedDict


class DocumentJobPayload(TypedDict):
    document_id: str
    tenant_id: str
    file_path: str


class DocumentJobQueue(Protocol):
    def enqueue(self, job: DocumentJobPayload) -> None:
        """Push a document job for asynchronous vectorization."""
        ...
