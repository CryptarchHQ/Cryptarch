"""Port for Tenant persistence."""

from typing import Protocol

from core.domain.models import Tenant


class TenantRepository(Protocol):
    def get_by_id(self, tenant_id: str) -> Tenant | None: ...
