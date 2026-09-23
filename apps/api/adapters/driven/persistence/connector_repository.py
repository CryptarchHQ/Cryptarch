"""ConnectorRepository implementation using Session and ORM Connector/Action models."""

from core.domain.models import Connector
from core.ports.connector_repository import ConnectorRepository
from sqlalchemy import or_
from sqlalchemy.orm import Session

from adapters.driven.persistence.models import ActionOrm, ConnectorOrm
from adapters.driven.persistence.uuid_utils import normalize_uuid, parse_uuid


def _orm_to_domain(orm: ConnectorOrm) -> Connector:
    return Connector(
        id=str(orm.id),
        tenant_id=str(orm.tenant_id),
        name=orm.name,
        description=orm.description,
        base_url=orm.base_url,
        auth_config=orm.auth_config,
    )


class SqlAlchemyConnectorRepository(ConnectorRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_by_tenant(self, tenant_id: str) -> list[Connector]:
        # Accept both canonical and hex tenant ids.
        tid_norm = normalize_uuid(tenant_id)
        tid_parsed = parse_uuid(tenant_id)
        tenant_hex = tid_parsed.hex if tid_parsed else tenant_id
        rows = (
            self._session.query(ConnectorOrm)
            .filter(
                or_(
                    ConnectorOrm.tenant_id == tenant_hex,
                    ConnectorOrm.tenant_id == tid_norm,
                )
            )
            .all()
        )
        return [_orm_to_domain(r) for r in rows]

    def get_by_id(self, connector_id: str, tenant_id: str) -> Connector | None:
        cid = parse_uuid(connector_id)
        if cid is None:
            return None
        c_hex, c_canonical = cid.hex, str(cid)
        orm = (
            self._session.query(ConnectorOrm)
            .filter(or_(ConnectorOrm.id == c_hex, ConnectorOrm.id == c_canonical))
            .first()
        )
        if not orm or normalize_uuid(str(orm.tenant_id)) != normalize_uuid(tenant_id):
            return None
        return _orm_to_domain(orm)

    def add(self, connector: Connector) -> Connector:
        orm = ConnectorOrm(
            tenant_id=connector.tenant_id,
            name=connector.name,
            description=connector.description,
            base_url=connector.base_url,
            auth_config=connector.auth_config,
        )
        self._session.add(orm)
        self._session.flush()
        self._session.refresh(orm)
        return _orm_to_domain(orm)

    def save(self, connector: Connector) -> Connector:
        cid = parse_uuid(connector.id)
        if cid is None:
            return connector
        c_hex, c_canonical = cid.hex, str(cid)
        orm = (
            self._session.query(ConnectorOrm)
            .filter(or_(ConnectorOrm.id == c_hex, ConnectorOrm.id == c_canonical))
            .first()
        )
        if not orm:
            return connector
        orm.name = connector.name
        orm.description = connector.description
        orm.base_url = connector.base_url
        orm.auth_config = connector.auth_config
        self._session.flush()
        self._session.refresh(orm)
        return _orm_to_domain(orm)

    def delete(self, connector: Connector) -> None:
        cid = parse_uuid(connector.id)
        if cid is None:
            return
        c_hex, c_canonical = cid.hex, str(cid)
        orm = (
            self._session.query(ConnectorOrm)
            .filter(or_(ConnectorOrm.id == c_hex, ConnectorOrm.id == c_canonical))
            .first()
        )
        if orm is not None:
            self._session.delete(orm)

    def has_actions(self, connector_id: str) -> bool:
        cid = parse_uuid(connector_id)
        if cid is None:
            return False
        c_hex, c_canonical = cid.hex, str(cid)
        return (
            self._session.query(ActionOrm)
            .filter(
                or_(
                    ActionOrm.connector_id == c_hex,
                    ActionOrm.connector_id == c_canonical,
                )
            )
            .first()
            is not None
        )


# Transitional semantic alias for Sprint 02.5 task-08a.
SqlAlchemyIntegrationRepository = SqlAlchemyConnectorRepository
