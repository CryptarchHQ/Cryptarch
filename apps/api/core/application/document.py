"""Document use cases. Orchestrate DocumentRepository and TagRepository (for tag_ids validation).
No Session or DB in this module; ports are injected.
"""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

from shared_contract import DOCUMENT_STATUS_ERROR, DOCUMENT_STATUS_QUEUED

from core.domain.models import Document
from core.ports.document_job_queue import DocumentJobPayload
from core.ports.document_repository import DocumentRepository
from core.ports.tag_repository import TagRepository

ALLOWED_UPLOAD_EXTENSIONS = frozenset({".pdf", ".txt", ".csv"})


class DocumentNotFoundError(Exception):
    """Raised when a document does not exist or does not belong to the tenant."""


class TagNotFoundError(Exception):
    """Raised when one or more tag_ids do not exist or do not belong to the tenant."""


class UnsupportedFileTypeError(Exception):
    """Raised when the uploaded file extension is not PDF/TXT/CSV."""


class DocumentNotRetryableError(Exception):
    """Raised when retry is requested but document status is not error."""


def _validate_tag_ids_in_tenant(
    tag_ids: list[str],
    tenant_id: str,
    tag_repo: TagRepository,
) -> None:
    """Raise TagNotFoundError if any tag_id is not found or not in tenant."""
    for tag_id in tag_ids:
        tag = tag_repo.get_by_id(tag_id, tenant_id)
        if not tag:
            raise TagNotFoundError("Tag not found")


def _extension_of(filename: str) -> str:
    return Path(filename).suffix.lower()


def _job_for(document: Document, tenant_id: str) -> DocumentJobPayload:
    return {
        "document_id": str(document.id),
        "tenant_id": str(tenant_id),
        "file_path": document.file_path or "",
    }


def list_documents(
    tenant_id: str,
    repo: DocumentRepository,
) -> list[Document]:
    """List all documents for the tenant."""
    return repo.list_by_tenant(tenant_id)


def get_document(
    document_id: str,
    tenant_id: str,
    repo: DocumentRepository,
) -> Document | None:
    """Get document by id; None if not found or not in tenant."""
    return repo.get_by_id(document_id, tenant_id)


def _sanitize_original_filename(filename: str) -> str | None:
    """Client basename only (no path components). Empty → None."""
    # Normalize separators so basename works for both / and \ paths.
    name = Path(filename.replace("\\", "/")).name
    return name or None


def create_document(
    tenant_id: str,
    status: str,
    file_path: str | None,
    tag_ids: list[str],
    repo: DocumentRepository,
    tag_repo: TagRepository,
    original_filename: str | None = None,
) -> Document:
    """Create document in tenant. Raises TagNotFoundError if any tag_id is not in tenant."""
    if tag_ids:
        _validate_tag_ids_in_tenant(tag_ids, tenant_id, tag_repo)
    doc = Document(
        tenant_id=tenant_id,
        status=status,
        file_path=file_path,
        original_filename=original_filename,
        uploaded_at=None,
    )
    return repo.add(doc, tag_ids)


def upload_document(
    tenant_id: str,
    filename: str,
    content: bytes,
    upload_dir: str,
    repo: DocumentRepository,
) -> tuple[Document, DocumentJobPayload]:
    """Persist file and create queued document. Caller must commit then enqueue the job.

    Raises UnsupportedFileTypeError if extension is not PDF/TXT/CSV.
    Does not create a document when the type is rejected.
    On-disk name remains a UUID; original client basename is stored separately.
    """
    ext = _extension_of(filename)
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise UnsupportedFileTypeError(f"Unsupported file type: {ext or '(none)'}")

    os.makedirs(upload_dir, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = str(Path(upload_dir) / stored_name)
    Path(file_path).write_bytes(content)

    try:
        doc = repo.add(
            Document(
                tenant_id=tenant_id,
                status=DOCUMENT_STATUS_QUEUED,
                file_path=file_path,
                original_filename=_sanitize_original_filename(filename),
                uploaded_at=datetime.now(UTC),
            ),
            tag_ids=[],
        )
    except Exception:
        Path(file_path).unlink(missing_ok=True)
        raise
    return doc, _job_for(doc, tenant_id)


def retry_document(
    document_id: str,
    tenant_id: str,
    repo: DocumentRepository,
) -> tuple[Document, DocumentJobPayload]:
    """Mark errored document as queued. Caller must commit then enqueue the job.

    Raises DocumentNotFoundError if missing / wrong tenant.
    Raises DocumentNotRetryableError if status is not error.
    Does not create a new document.
    """
    doc = repo.get_by_id(document_id, tenant_id)
    if doc is None:
        raise DocumentNotFoundError("Document not found")
    if doc.status != DOCUMENT_STATUS_ERROR:
        raise DocumentNotRetryableError("Document is not in error status")

    doc.status = DOCUMENT_STATUS_QUEUED
    saved = repo.save(doc, tag_ids=None)
    return saved, _job_for(saved, tenant_id)


def update_document(
    document_id: str,
    tenant_id: str,
    status: str | None,
    file_path: str | None,
    tag_ids: list[str] | None,
    repo: DocumentRepository,
    tag_repo: TagRepository,
) -> Document | None:
    """Update document. None if not found. Raises TagNotFoundError if tag_ids invalid."""
    doc = repo.get_by_id(document_id, tenant_id)
    if not doc:
        return None
    if tag_ids is not None:
        _validate_tag_ids_in_tenant(tag_ids, tenant_id, tag_repo)
    if status is not None:
        doc.status = status
    if file_path is not None:
        doc.file_path = file_path
    return repo.save(doc, tag_ids)


def delete_document(
    document_id: str,
    tenant_id: str,
    repo: DocumentRepository,
) -> bool:
    """Delete document; True if deleted, False if not found."""
    doc = repo.get_by_id(document_id, tenant_id)
    if not doc:
        return False
    repo.delete(doc)
    return True
