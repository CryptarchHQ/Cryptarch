"""Use case: session profile for the authenticated user."""

from dataclasses import dataclass

from core.ports.tenant_repository import TenantRepository
from core.ports.user_repository import UserRepository


@dataclass(frozen=True)
class SessionProfile:
    sub: str
    email: str
    role: str
    tenant_name: str | None


def get_session_profile(
    tenant_id: str,
    user_id: str,
    role: str,
    user_repo: UserRepository,
    tenant_repo: TenantRepository,
) -> SessionProfile | None:
    """
    Load email from User and tenant_name from Tenant.
    Role and sub come from the authenticated session (JWT).
    Returns None if the user is missing or not in the tenant.
    """
    user = user_repo.get_by_id(user_id, tenant_id)
    if user is None:
        return None
    tenant = tenant_repo.get_by_id(tenant_id)
    tenant_name = tenant.name if tenant is not None else None
    return SessionProfile(
        sub=user_id,
        email=user.email,
        role=role,
        tenant_name=tenant_name,
    )
