"""Tenant repository implementation. Implements core.ports.tenant_repository.TenantRepository."""

from core.domain.models import Tenant
from core.ports.tenant_repository import TenantRepository
from sqlalchemy.orm import Session

from adapters.driven.persistence.models import TenantOrm
from adapters.driven.persistence.uuid_utils import parse_uuid


def _orm_to_domain(orm: TenantOrm) -> Tenant:
    return Tenant(id=str(orm.id), name=orm.name)


class TenantRepositoryImpl(TenantRepository):
    """Implements TenantRepository using SQLAlchemy Session and TenantOrm."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_id(self, tenant_id: str) -> Tenant | None:
        tid = parse_uuid(tenant_id)
        if tid is None:
            return None
        tid_hex = tid.hex
        tid_canonical = str(tid)
        orm = (
            self._session.query(TenantOrm)
            .filter(TenantOrm.id.in_([tid_hex, tid_canonical]))
            .first()
        )
        return _orm_to_domain(orm) if orm else None
