"""
Saved Filter use cases. Orchestrate SavedFilterRepository (and TagRepository for tag validation).
No Session or DB in this module; ports are injected.
"""

from core.domain.models import SavedFilter
from core.ports.filter_preview import FilterPreviewPort, FilterPreviewResult
from core.ports.saved_filter_repository import SavedFilterRepository
from core.ports.tag_repository import TagRepository

SAMPLE_LIMIT = 5


class FilterNotFoundError(Exception):
    """Raised when a filter does not exist or does not belong to the tenant."""


class TagNotFoundError(Exception):
    """Raised when one or more tag_ids do not exist or do not belong to the tenant."""


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


def preview_filter(
    tenant_id: str,
    target_type: str,
    tag_ids: list[str],
    tag_repo: TagRepository,
    preview_port: FilterPreviewPort,
) -> FilterPreviewResult:
    """Count/sample entities matching tag AND semantics. Does not persist.

    Raises TagNotFoundError if any tag_id is missing or outside the tenant.
    Empty tag_ids means no restriction (all entities of that type in tenant).
    """
    _validate_tag_ids_in_tenant(tag_ids, tenant_id, tag_repo)
    return preview_port.preview(
        tenant_id, target_type, tag_ids, sample_limit=SAMPLE_LIMIT
    )


def list_filters(
    tenant_id: str,
    repo: SavedFilterRepository,
) -> list[SavedFilter]:
    """List all saved filters for the tenant."""
    return repo.list_by_tenant(tenant_id)


def get_filter(
    filter_id: str,
    tenant_id: str,
    repo: SavedFilterRepository,
) -> SavedFilter | None:
    """Get a saved filter by id; None if not found or not in tenant."""
    return repo.get_by_id(filter_id, tenant_id)


def create_filter(
    tenant_id: str,
    name: str,
    target_type: str,
    tag_ids: list[str],
    repo: SavedFilterRepository,
    tag_repo: TagRepository,
) -> SavedFilter:
    """Create a saved filter. Raises TagNotFoundError if any tag_id is not in tenant."""
    _validate_tag_ids_in_tenant(tag_ids, tenant_id, tag_repo)
    f = SavedFilter(
        tenant_id=tenant_id,
        name=name,
        target_type=target_type,
    )
    return repo.add(f, tag_ids)


def update_filter(
    filter_id: str,
    tenant_id: str,
    name: str | None,
    tag_ids: list[str] | None,
    repo: SavedFilterRepository,
    tag_repo: TagRepository,
) -> SavedFilter:
    """Update a saved filter. Raises FilterNotFoundError if not found; TagNotFoundError if tag_ids invalid."""
    existing = repo.get_by_id(filter_id, tenant_id)
    if not existing:
        raise FilterNotFoundError("Filter not found")
    if tag_ids is not None:
        _validate_tag_ids_in_tenant(tag_ids, tenant_id, tag_repo)
    if name is not None:
        existing.name = name
    return repo.save(existing, tag_ids)


def delete_filter(
    filter_id: str,
    tenant_id: str,
    repo: SavedFilterRepository,
) -> None:
    """Delete a saved filter. Raises FilterNotFoundError if not found."""
    f = repo.get_by_id(filter_id, tenant_id)
    if not f:
        raise FilterNotFoundError("Filter not found")
    repo.delete(f)
