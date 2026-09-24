"""Request/response schemas for Document (admin)."""

import uuid
from datetime import datetime
from typing import Protocol

from pydantic import BaseModel
from shared_contract import DocumentStatus


class DocumentCreateBody(BaseModel):
    status: DocumentStatus = DocumentStatus.queued
    file_path: str | None = None
    original_filename: str | None = None
    tag_ids: list[uuid.UUID] = []


class DocumentUpdateBody(BaseModel):
    status: DocumentStatus | None = None
    file_path: str | None = None
    tag_ids: list[uuid.UUID] | None = None


def _canonical_str(value: str | None) -> str:
    if not value:
        return ""
    try:
        if len(value) == 32 and "-" not in value:
            return str(uuid.UUID(hex=value))
        return str(uuid.UUID(value))
    except (ValueError, TypeError):
        return value


def _uploaded_at_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def document_to_response(
    document: "DocumentLike",
    tag_ids: list[str] | None = None,
) -> dict:
    """Serialize Document to response dict. id, tenant_id, tag_ids in canonical form."""
    if tag_ids is None:
        tag_ids = []
    return {
        "id": _canonical_str(getattr(document, "id", None)),
        "tenant_id": _canonical_str(getattr(document, "tenant_id", None)),
        "status": document.status,
        "file_path": document.file_path,
        "original_filename": getattr(document, "original_filename", None),
        "uploaded_at": _uploaded_at_iso(getattr(document, "uploaded_at", None)),
        "tag_ids": tag_ids,
    }


class DocumentLike(Protocol):
    """Minimal interface for document_to_response (core.domain.models.Document)."""

    id: str
    tenant_id: str
    status: str
    file_path: str | None
    original_filename: str | None
    uploaded_at: datetime | None
