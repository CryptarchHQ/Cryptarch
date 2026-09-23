"""Connector use cases. No SQLAlchemy; orchestrate via ConnectorRepository port."""

from core.domain.models import Connector
from core.ports.connector_repository import ConnectorRepository


class ConnectorHasActionsError(Exception):
    """Raised when delete is attempted but connector has associated actions."""


def list_connectors(tenant_id: str, repo: ConnectorRepository) -> list[Connector]:
    """List all connectors for the tenant."""
    return repo.list_by_tenant(tenant_id)


def get_connector(
    connector_id: str, tenant_id: str, repo: ConnectorRepository
) -> Connector | None:
    """Get connector by id (hex or canonical) and tenant; None if not found."""
    return repo.get_by_id(connector_id, tenant_id)


def create_connector(
    tenant_id: str,
    name: str,
    base_url: str,
    auth_config: dict | None,
    repo: ConnectorRepository,
    description: str | None = None,
) -> Connector:
    """Create connector in tenant."""
    conn = Connector(
        tenant_id=tenant_id,
        name=name,
        base_url=base_url,
        auth_config=auth_config,
        description=description,
    )
    return repo.add(conn)


def update_connector(
    connector_id: str,
    tenant_id: str,
    base_url: str | None,
    auth_config: dict | None,
    repo: ConnectorRepository,
    name: str | None = None,
    description: str | None = None,
) -> Connector | None:
    """Update connector; None if not found."""
    conn = repo.get_by_id(connector_id, tenant_id)
    if not conn:
        return None
    if name is not None:
        conn.name = name
    if description is not None:
        conn.description = description
    if base_url is not None:
        conn.base_url = base_url
    if auth_config is not None:
        conn.auth_config = auth_config
    return repo.save(conn)


def delete_connector(
    connector_id: str, tenant_id: str, repo: ConnectorRepository
) -> bool:
    """Delete connector; True if deleted, False if not found. Raises ConnectorHasActionsError if connector has actions."""
    conn = repo.get_by_id(connector_id, tenant_id)
    if not conn:
        return False
    if repo.has_actions(connector_id):
        raise ConnectorHasActionsError()
    repo.delete(conn)
    return True
