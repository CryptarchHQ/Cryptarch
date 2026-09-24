"""Admin HTTP routes for Users. Uses core.application.user use cases and UserRepositoryImpl."""

from typing import Annotated

from core.application import user as user_use_cases
from core.application.user import TagNotFoundError
from dependencies import CurrentUser, get_db, require_admin
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from adapters.driven.persistence.password_hasher import PasswordHasherImpl
from adapters.driven.persistence.tag_repository import SqlAlchemyTagRepository
from adapters.driven.persistence.user_repository import UserRepositoryImpl
from adapters.driving.schemas.user import (
    UserCreateBody,
    UserUpdateBody,
    user_to_response,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _tag_ids_to_str(tag_ids: list) -> list[str]:
    """Convert list of UUID to canonical string list."""
    return [str(t) for t in tag_ids]


@router.get("/users")
def list_users(
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """List users of the current tenant. Response includes tag_ids."""
    repo = UserRepositoryImpl(db)
    users = user_use_cases.list_users(current_user.tenant_id, repo)
    return [
        user_to_response(u, tag_ids=repo.get_user_tag_ids(u.id)) for u in users
    ]


@router.get("/users/{user_id}")
def get_user(
    user_id: str,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Get user by id; 404 if not in current tenant. Response includes tag_ids."""
    repo = UserRepositoryImpl(db)
    user = user_use_cases.get_user(user_id, current_user.tenant_id, repo)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return user_to_response(user, tag_ids=repo.get_user_tag_ids(user.id))


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreateBody,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Create user in current tenant. tenant_id from JWT only. tag_ids must belong to tenant."""
    repo = UserRepositoryImpl(db)
    tag_repo = SqlAlchemyTagRepository(db)
    password_hasher = PasswordHasherImpl()
    tag_ids_str = _tag_ids_to_str(body.tag_ids)
    try:
        user = user_use_cases.create_user(
            tenant_id=current_user.tenant_id,
            email=body.email,
            role=body.role.value,
            password=body.password,
            repo=repo,
            password_hasher=password_hasher,
            tag_ids=tag_ids_str,
            tag_repo=tag_repo,
        )
        db.commit()
    except TagNotFoundError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found",
        )
    except ValueError as e:
        db.rollback()
        if "already exists" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already exists in tenant",
            ) from e
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    return user_to_response(user, tag_ids=repo.get_user_tag_ids(user.id))


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    body: UserUpdateBody,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Update user; 404 if not in current tenant. tag_ids must belong to tenant when present."""
    repo = UserRepositoryImpl(db)
    tag_repo = SqlAlchemyTagRepository(db)
    password_hasher = PasswordHasherImpl()
    tag_ids_str = _tag_ids_to_str(body.tag_ids) if body.tag_ids is not None else None
    try:
        user = user_use_cases.update_user(
            user_id=user_id,
            tenant_id=current_user.tenant_id,
            repo=repo,
            email=body.email,
            role=body.role.value if body.role is not None else None,
            password=body.password,
            password_hasher=password_hasher,
            tag_ids=tag_ids_str,
            tag_repo=tag_repo,
        )
        if user is None:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )
        db.commit()
    except TagNotFoundError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found",
        )
    return user_to_response(user, tag_ids=repo.get_user_tag_ids(user.id))


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Delete user; 404 if not in current tenant."""
    repo = UserRepositoryImpl(db)
    deleted = user_use_cases.delete_user(user_id, current_user.tenant_id, repo)
    if not deleted:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    db.commit()
    return None
