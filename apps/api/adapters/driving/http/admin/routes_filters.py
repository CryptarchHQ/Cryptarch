"""Admin HTTP routes for Saved Filters. Uses core.application.saved_filter and repositories."""

from typing import Annotated

from core.application import saved_filter as saved_filter_use_cases
from core.application.saved_filter import FilterNotFoundError, TagNotFoundError
from dependencies import CurrentUser, get_db, require_admin
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from adapters.driven.persistence.filter_preview import FilterPreviewImpl
from adapters.driven.persistence.saved_filter_repository import (
    SavedFilterRepositoryImpl,
)
from adapters.driven.persistence.tag_repository import SqlAlchemyTagRepository
from adapters.driving.schemas.saved_filter import (
    FilterCreateBody,
    FilterPreviewBody,
    FilterPreviewResponse,
    FilterPreviewSampleResponse,
    FilterUpdateBody,
    filter_to_response,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _tag_ids_to_str(tag_ids: list) -> list[str]:
    """Convert list of UUID to canonical string list."""
    return [str(t) for t in tag_ids]


@router.post("/filters/preview", response_model=FilterPreviewResponse)
def preview_filter(
    body: FilterPreviewBody,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Count entities matching tag AND semantics for the current tenant. Does not persist."""
    tag_repo = SqlAlchemyTagRepository(db)
    preview_port = FilterPreviewImpl(db)
    tag_ids_str = _tag_ids_to_str(body.tag_ids)
    try:
        result = saved_filter_use_cases.preview_filter(
            current_user.tenant_id,
            body.target_type.value,
            tag_ids_str,
            tag_repo,
            preview_port,
        )
    except TagNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found",
        )
    return FilterPreviewResponse(
        count=result.count,
        sample=[
            FilterPreviewSampleResponse(id=item.id, label=item.label)
            for item in result.sample
        ],
    )


@router.get("/filters")
def list_filters(
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """List saved filters of the current tenant."""
    repo = SavedFilterRepositoryImpl(db)
    filters = saved_filter_use_cases.list_filters(current_user.tenant_id, repo)
    return [
        filter_to_response(f, tag_ids=repo.get_filter_tag_ids(f.id)) for f in filters
    ]


@router.get("/filters/{filter_id}")
def get_filter(
    filter_id: str,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Get saved filter by id; 404 if not in current tenant. Response includes tag_ids."""
    repo = SavedFilterRepositoryImpl(db)
    f = saved_filter_use_cases.get_filter(filter_id, current_user.tenant_id, repo)
    if f is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Filter not found",
        )
    tag_ids = repo.get_filter_tag_ids(f.id)
    return filter_to_response(f, tag_ids=tag_ids)


@router.post("/filters", status_code=status.HTTP_201_CREATED)
def create_filter(
    body: FilterCreateBody,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Create saved filter in current tenant. tag_ids must exist and belong to tenant; 404 if not."""
    repo = SavedFilterRepositoryImpl(db)
    tag_repo = SqlAlchemyTagRepository(db)
    tag_ids_str = _tag_ids_to_str(body.tag_ids)
    try:
        f = saved_filter_use_cases.create_filter(
            current_user.tenant_id,
            body.name,
            body.target_type.value,
            tag_ids_str,
            repo,
            tag_repo,
        )
        db.commit()
    except TagNotFoundError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found",
        )
    return filter_to_response(f, tag_ids=tag_ids_str)


@router.patch("/filters/{filter_id}")
def update_filter(
    filter_id: str,
    body: FilterUpdateBody,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Update saved filter; 404 if not in current tenant. tag_ids must exist and belong to tenant."""
    repo = SavedFilterRepositoryImpl(db)
    tag_repo = SqlAlchemyTagRepository(db)
    tag_ids_str = _tag_ids_to_str(body.tag_ids) if body.tag_ids is not None else None
    try:
        f = saved_filter_use_cases.update_filter(
            filter_id,
            current_user.tenant_id,
            body.name,
            tag_ids_str,
            repo,
            tag_repo,
        )
        db.commit()
    except FilterNotFoundError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Filter not found",
        )
    except TagNotFoundError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found",
        )
    tag_ids = repo.get_filter_tag_ids(f.id)
    return filter_to_response(f, tag_ids=tag_ids)


@router.delete("/filters/{filter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_filter(
    filter_id: str,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Delete saved filter; 404 if not in current tenant."""
    repo = SavedFilterRepositoryImpl(db)
    try:
        saved_filter_use_cases.delete_filter(filter_id, current_user.tenant_id, repo)
        db.commit()
    except FilterNotFoundError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Filter not found",
        )
    return None
