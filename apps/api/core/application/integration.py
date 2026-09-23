"""Integration use cases.

Backward-compatible semantic layer over connector use cases.
"""

from core.application import connector as connector_use_cases
from core.domain.models import Integration
from core.ports.connector_repository import IntegrationRepository

IntegrationHasActionsError = connector_use_cases.ConnectorHasActionsError


def list_integrations(tenant_id: str, repo: IntegrationRepository) -> list[Integration]:
    return [
        Integration(**integration.__dict__)
        for integration in connector_use_cases.list_connectors(tenant_id, repo)
    ]


def get_integration(
    integration_id: str, tenant_id: str, repo: IntegrationRepository
) -> Integration | None:
    integration = connector_use_cases.get_connector(integration_id, tenant_id, repo)
    if integration is None:
        return None
    return Integration(**integration.__dict__)


def create_integration(
    tenant_id: str,
    name: str,
    base_url: str,
    auth_config: dict | None,
    repo: IntegrationRepository,
    description: str | None = None,
) -> Integration:
    integration = connector_use_cases.create_connector(
        tenant_id=tenant_id,
        name=name,
        base_url=base_url,
        auth_config=auth_config,
        repo=repo,
        description=description,
    )
    return Integration(**integration.__dict__)


def update_integration(
    integration_id: str,
    tenant_id: str,
    base_url: str | None,
    auth_config: dict | None,
    repo: IntegrationRepository,
    name: str | None = None,
    description: str | None = None,
) -> Integration | None:
    integration = connector_use_cases.update_connector(
        connector_id=integration_id,
        tenant_id=tenant_id,
        base_url=base_url,
        auth_config=auth_config,
        repo=repo,
        name=name,
        description=description,
    )
    if integration is None:
        return None
    return Integration(**integration.__dict__)


def delete_integration(
    integration_id: str, tenant_id: str, repo: IntegrationRepository
) -> bool:
    return connector_use_cases.delete_connector(integration_id, tenant_id, repo)
