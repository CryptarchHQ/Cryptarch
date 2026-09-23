import uuid

from core.application import integration as integration_use_cases
from core.application import integration_action as integration_action_use_cases
from core.domain.models import Action, Connector, Integration, IntegrationAction
from core.ports.action_repository import ActionRepository, IntegrationActionRepository
from core.ports.connector_repository import ConnectorRepository, IntegrationRepository
from domain.models import (
    Action as ActionOrm,
)
from domain.models import (
    Connector as ConnectorOrm,
)
from domain.models import (
    Integration as IntegrationOrm,
)
from domain.models import (
    IntegrationAction as IntegrationActionOrm,
)


def _id() -> str:
    return str(uuid.uuid4())


class _ConnectorRepoStub:
    def __init__(self) -> None:
        self.items: dict[str, Connector] = {}

    def list_by_tenant(self, tenant_id: str) -> list[Connector]:
        return [c for c in self.items.values() if c.tenant_id == tenant_id]

    def get_by_id(self, connector_id: str, tenant_id: str) -> Connector | None:
        item = self.items.get(connector_id)
        if item and item.tenant_id == tenant_id:
            return item
        return None

    def add(self, connector: Connector) -> Connector:
        connector.id = connector.id or _id()
        self.items[connector.id] = connector
        return connector

    def save(self, connector: Connector) -> Connector:
        self.items[connector.id] = connector
        return connector

    def delete(self, connector: Connector) -> None:
        if connector.id in self.items:
            del self.items[connector.id]

    def has_actions(self, connector_id: str) -> bool:
        return False


class _TagRepoStub:
    def get_by_id(self, tag_id: str, tenant_id: str):
        return object()


class _ActionRepoStub:
    def __init__(self) -> None:
        self.items: dict[str, Action] = {}

    def list_by_tenant(
        self, tenant_id: str, connector_id: str | None = None
    ) -> list[Action]:
        results = [a for a in self.items.values() if a.tenant_id == tenant_id]
        if connector_id is not None:
            results = [a for a in results if a.connector_id == connector_id]
        return results

    def get_by_id(self, action_id: str, tenant_id: str) -> Action | None:
        item = self.items.get(action_id)
        if item and item.tenant_id == tenant_id:
            return item
        return None

    def get_action_tag_ids(self, action_id: str) -> list[str]:
        return []

    def list_by_ids(self, action_ids: list[str], tenant_id: str) -> list[Action]:
        out: list[Action] = []
        for aid in action_ids:
            a = self.get_by_id(aid, tenant_id)
            if a is not None:
                out.append(a)
        return out

    def list_action_tag_ids_for_actions(
        self, action_ids: list[str]
    ) -> dict[str, list[str]]:
        return {aid: self.get_action_tag_ids(aid) for aid in action_ids}

    def add(self, action: Action, tag_ids: list[str]) -> Action:
        action.id = action.id or _id()
        self.items[action.id] = action
        return action

    def save(self, action: Action, tag_ids: list[str] | None) -> Action:
        self.items[action.id] = action
        return action

    def delete(self, action: Action) -> None:
        if action.id in self.items:
            del self.items[action.id]


def test_domain_and_orm_integration_aliases_are_backward_compatible():
    integration = Integration(
        tenant_id=_id(),
        name="api.example.com",
        base_url="https://api.example.com",
        auth_config={"type": "bearer"},
    )
    assert isinstance(integration, Connector)

    integration_action = IntegrationAction(
        tenant_id=_id(),
        connector_id=_id(),
        method="GET",
        path="/items",
    )
    assert isinstance(integration_action, Action)
    assert integration_action.integration_id == integration_action.connector_id

    new_integration_id = _id()
    integration_action.integration_id = new_integration_id
    assert integration_action.connector_id == new_integration_id

    assert IntegrationOrm is ConnectorOrm
    assert IntegrationActionOrm is ActionOrm
    assert IntegrationRepository is ConnectorRepository
    assert IntegrationActionRepository is ActionRepository


def test_integration_use_cases_reuse_connector_behavior():
    repo = _ConnectorRepoStub()
    tenant_id = _id()

    created = integration_use_cases.create_integration(
        tenant_id=tenant_id,
        name="service.example.com",
        base_url="https://service.example.com",
        auth_config={"type": "api_key"},
        repo=repo,
    )
    assert isinstance(created, Integration)

    listed = integration_use_cases.list_integrations(tenant_id, repo)
    assert len(listed) == 1
    assert listed[0].id == created.id

    fetched = integration_use_cases.get_integration(created.id, tenant_id, repo)
    assert fetched is not None
    assert fetched.base_url == "https://service.example.com"


def test_integration_action_use_cases_map_integration_id_to_connector_id():
    connector_repo = _ConnectorRepoStub()
    action_repo = _ActionRepoStub()
    tag_repo = _TagRepoStub()
    tenant_id = _id()
    integration = connector_repo.add(
        Connector(
            tenant_id=tenant_id,
            name="api.example.com",
            base_url="https://api.example.com",
            auth_config=None,
        )
    )

    created = integration_action_use_cases.create_integration_action(
        tenant_id=tenant_id,
        integration_id=integration.id,
        method="POST",
        path="/run",
        name="Run action",
        request_config={"timeout": 30},
        tag_ids=[],
        repo=action_repo,
        integration_repo=connector_repo,
        tag_repo=tag_repo,
    )
    assert isinstance(created, IntegrationAction)
    assert created.integration_id == integration.id
    assert created.connector_id == integration.id

    filtered = integration_action_use_cases.list_integration_actions(
        tenant_id=tenant_id,
        repo=action_repo,
        integration_id=integration.id,
    )
    assert len(filtered) == 1
    assert filtered[0].id == created.id
