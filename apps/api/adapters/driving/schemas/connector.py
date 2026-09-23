"""Request/response schemas and serialization for Connectors."""

import uuid

from pydantic import BaseModel, Field


def _parse_uuid(value: str) -> uuid.UUID | None:
    if not value or not isinstance(value, str):
        return None
    value = value.strip()
    try:
        if len(value) == 32 and "-" not in value:
            return uuid.UUID(hex=value)
        return uuid.UUID(value)
    except (ValueError, TypeError):
        return None


class ConnectorCreateBody(BaseModel):
    name: str = Field(min_length=1)
    base_url: str
    description: str | None = None
    auth_config: dict | None = None


class ConnectorUpdateBody(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    base_url: str | None = None
    auth_config: dict | None = None


def connector_to_response(connector) -> dict:
    """Serialize Connector to response dict. id and tenant_id in canonical form."""
    ci = _parse_uuid(str(connector.id)) if getattr(connector, "id", None) else None
    ti = (
        _parse_uuid(str(connector.tenant_id))
        if getattr(connector, "tenant_id", None)
        else None
    )
    return {
        "id": str(ci) if ci else str(getattr(connector, "id", "")),
        "tenant_id": str(ti) if ti else str(getattr(connector, "tenant_id", "")),
        "name": connector.name,
        "description": getattr(connector, "description", None),
        "base_url": connector.base_url,
        "auth_config": getattr(connector, "auth_config", None),
    }
