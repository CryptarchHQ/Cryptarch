"""Request/response schemas for Saved Filter (admin)."""

import uuid
from typing import Protocol

from pydantic import BaseModel
from shared_contract import SavedFilterTarget


class FilterCreateBody(BaseModel):
    name: str
    target_type: SavedFilterTarget
    tag_ids: list[uuid.UUID] = []


class FilterUpdateBody(BaseModel):
    name: str | None = None
    tag_ids: list[uuid.UUID] | None = None


class FilterPreviewBody(BaseModel):
    target_type: SavedFilterTarget
    tag_ids: list[uuid.UUID] = []


class FilterPreviewSampleResponse(BaseModel):
    id: str
    label: str


class FilterPreviewResponse(BaseModel):
    count: int
    sample: list[FilterPreviewSampleResponse]


def filter_to_response(
    saved_filter: "SavedFilterLike",
    tag_ids: list[str] | None = None,
) -> dict:
    """Serialize SavedFilter to response dict. tag_ids must be canonical UUID strings."""
    if tag_ids is None:
        tag_ids = []
    id_val = _canonical_str(saved_filter.id)
    tenant_val = _canonical_str(saved_filter.tenant_id)
    return {
        "id": id_val,
        "tenant_id": tenant_val,
        "target_type": saved_filter.target_type,
        "name": saved_filter.name,
        "tag_ids": tag_ids,
    }


def _canonical_str(value: str | None) -> str:
    if not value:
        return ""
    try:
        if len(value) == 32 and "-" not in value:
            return str(uuid.UUID(hex=value))
        return str(uuid.UUID(value))
    except (ValueError, TypeError):
        return value


class SavedFilterLike(Protocol):
    """Minimal interface for filter_to_response (core.domain.models.SavedFilter)."""

    id: str
    tenant_id: str
    target_type: str
    name: str
