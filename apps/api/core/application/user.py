"""User use cases. Depend only on core.ports; no adapters or sqlalchemy."""

from core.domain.models import User
from core.ports.password_hasher import PasswordHasher
from core.ports.tag_repository import TagRepository
from core.ports.user_repository import UserRepository


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


def list_users(tenant_id: str, repo: UserRepository) -> list[User]:
    """List all users for the tenant."""
    return repo.list_by_tenant(tenant_id)


def get_user(user_id: str, tenant_id: str, repo: UserRepository) -> User | None:
    """Get user by id (hex or canonical uuid); None if not found or wrong tenant."""
    return repo.get_by_id(user_id, tenant_id)


def create_user(
    tenant_id: str,
    email: str,
    role: str,
    password: str,
    repo: UserRepository,
    password_hasher: PasswordHasher,
    tag_ids: list[str] | None = None,
    tag_repo: TagRepository | None = None,
) -> User:
    """Create user in tenant. Hashes password via PasswordHasher.

    Raises ValueError if email already exists.
    Raises TagNotFoundError if any tag_id is not in tenant.
    """
    existing = repo.get_by_email(tenant_id, email)
    if existing is not None:
        raise ValueError("Email already exists in tenant")
    ids = list(tag_ids) if tag_ids else []
    if ids:
        if tag_repo is None:
            raise TagNotFoundError("Tag not found")
        _validate_tag_ids_in_tenant(ids, tenant_id, tag_repo)
    user = User(
        id="",  # will be set by repository
        tenant_id=tenant_id,
        email=email,
        role=role,
        password_hash=password_hasher.hash(password),
    )
    return repo.add(user, tag_ids=ids or None)


def update_user(
    user_id: str,
    tenant_id: str,
    repo: UserRepository,
    *,
    email: str | None = None,
    role: str | None = None,
    password: str | None = None,
    password_hasher: PasswordHasher | None = None,
    tag_ids: list[str] | None = None,
    tag_repo: TagRepository | None = None,
) -> User | None:
    """Update user; returns updated user or None if not found.

    tag_ids None = leave tags unchanged; list (even empty) replaces.
    Raises TagNotFoundError if tag_ids invalid.
    """
    user = repo.get_by_id(user_id, tenant_id)
    if user is None:
        return None
    if tag_ids is not None:
        if tag_repo is None:
            raise TagNotFoundError("Tag not found")
        _validate_tag_ids_in_tenant(tag_ids, tenant_id, tag_repo)
    if email is not None:
        user.email = email
    if role is not None:
        user.role = role
    if password is not None and password_hasher is not None:
        user.password_hash = password_hasher.hash(password)
    return repo.save(user, tag_ids=tag_ids)


def delete_user(user_id: str, tenant_id: str, repo: UserRepository) -> bool:
    """Delete user; returns True if deleted, False if not found."""
    user = repo.get_by_id(user_id, tenant_id)
    if user is None:
        return False
    repo.delete(user)
    return True
