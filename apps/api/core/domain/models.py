"""Pure domain entities (no SQLAlchemy).

Tags are metadata only; permissions via saved filters + groups.
Every entity is tenant-scoped.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class Tenant:
    id: str
    name: str | None = None


@dataclass
class Tag:
    tenant_id: str
    name: str
    id: str | None = None


@dataclass
class User:
    tenant_id: str
    email: str
    role: str  # admin | user
    password_hash: str | None = None
    id: str | None = None


@dataclass
class SavedFilter:
    tenant_id: str
    target_type: str  # user | action | document
    name: str
    id: str | None = None


@dataclass
class Group:
    tenant_id: str
    name: str
    id: str | None = None


@dataclass
class Connector:
    tenant_id: str
    base_url: str
    name: str
    auth_config: dict[str, Any] | None = None
    description: str | None = None
    id: str | None = None


@dataclass
class Integration(Connector):
    """Transitional semantic alias for Connector."""


@dataclass
class Action:
    tenant_id: str
    connector_id: str
    method: str
    path: str
    name: str | None = None
    request_config: dict[str, Any] | None = None
    input_schema_json: Any | None = None
    input_schema_version: str | None = None
    id: str | None = None


@dataclass
class IntegrationAction(Action):
    """Transitional semantic alias for Action with integration terminology."""

    @property
    def integration_id(self) -> str:
        return self.connector_id

    @integration_id.setter
    def integration_id(self, value: str) -> None:
        self.connector_id = value


@dataclass
class Document:
    tenant_id: str
    status: str  # queued | processing | indexed | error
    file_path: str | None = None
    original_filename: str | None = None
    uploaded_at: datetime | None = None
    id: str | None = None


@dataclass
class UserPreferences:
    tenant_id: str
    user_id: str
    theme: str = "system"
    language: str = "es"
    table_density: str = "comfortable"
    metadata: dict[str, Any] | None = None
