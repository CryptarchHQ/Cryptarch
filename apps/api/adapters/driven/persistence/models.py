"""SQLAlchemy ORM models for persistence layer.

These are the concrete database models. Domain entities live in
`core.domain.models` as pure Python types.
"""

import uuid

from sqlalchemy import Column, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class TenantOrm(Base):
    __tablename__ = "tenants"
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: uuid.uuid4().hex)
    name = Column(String(255), nullable=True)


class TagOrm(Base):
    __tablename__ = "tags"
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: uuid.uuid4().hex)
    tenant_id = Column(
        UUID(as_uuid=False), ForeignKey("tenants.id"), nullable=False, index=True
    )
    name = Column(String(255), nullable=False)
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_tags_tenant_name"),
    )


class UserOrm(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: uuid.uuid4().hex)
    tenant_id = Column(
        UUID(as_uuid=False), ForeignKey("tenants.id"), nullable=False, index=True
    )
    email = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False)  # admin | user
    password_hash = Column(String(255), nullable=True)  # bcrypt
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
    )


class UserTagOrm(Base):
    __tablename__ = "user_tags"
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), primary_key=True)
    tag_id = Column(UUID(as_uuid=False), ForeignKey("tags.id"), primary_key=True)


class SavedFilterOrm(Base):
    __tablename__ = "saved_filters"
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: uuid.uuid4().hex)
    tenant_id = Column(
        UUID(as_uuid=False), ForeignKey("tenants.id"), nullable=False, index=True
    )
    target_type = Column(String(32), nullable=False)  # user | action | document
    name = Column(String(255), nullable=False)


class SavedFilterTagOrm(Base):
    __tablename__ = "saved_filter_tags"
    saved_filter_id = Column(
        UUID(as_uuid=False), ForeignKey("saved_filters.id"), primary_key=True
    )
    tag_id = Column(UUID(as_uuid=False), ForeignKey("tags.id"), primary_key=True)


class GroupOrm(Base):
    __tablename__ = "groups"
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: uuid.uuid4().hex)
    tenant_id = Column(
        UUID(as_uuid=False), ForeignKey("tenants.id"), nullable=False, index=True
    )
    name = Column(String(255), nullable=False)


class GroupUserFilterOrm(Base):
    __tablename__ = "group_user_filters"
    group_id = Column(UUID(as_uuid=False), ForeignKey("groups.id"), primary_key=True)
    saved_filter_id = Column(
        UUID(as_uuid=False), ForeignKey("saved_filters.id"), primary_key=True
    )


class GroupActionFilterOrm(Base):
    __tablename__ = "group_action_filters"
    group_id = Column(UUID(as_uuid=False), ForeignKey("groups.id"), primary_key=True)
    saved_filter_id = Column(
        UUID(as_uuid=False), ForeignKey("saved_filters.id"), primary_key=True
    )


class GroupDocumentFilterOrm(Base):
    __tablename__ = "group_document_filters"
    group_id = Column(UUID(as_uuid=False), ForeignKey("groups.id"), primary_key=True)
    saved_filter_id = Column(
        UUID(as_uuid=False), ForeignKey("saved_filters.id"), primary_key=True
    )


class ConnectorOrm(Base):
    __tablename__ = "connectors"
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: uuid.uuid4().hex)
    tenant_id = Column(
        UUID(as_uuid=False), ForeignKey("tenants.id"), nullable=False, index=True
    )
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    base_url = Column(String(2048), nullable=False)
    auth_config = Column(JSONB, nullable=True)


class ActionOrm(Base):
    __tablename__ = "actions"
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: uuid.uuid4().hex)
    tenant_id = Column(
        UUID(as_uuid=False), ForeignKey("tenants.id"), nullable=False, index=True
    )
    connector_id = Column(
        UUID(as_uuid=False), ForeignKey("connectors.id"), nullable=False
    )
    method = Column(String(16), nullable=False)
    path = Column(String(2048), nullable=False)
    request_config = Column(JSONB, nullable=True)
    input_schema_json = Column(JSONB, nullable=True)
    input_schema_version = Column(String(128), nullable=True)
    name = Column(String(255), nullable=True)


class ActionTagOrm(Base):
    __tablename__ = "action_tags"
    action_id = Column(UUID(as_uuid=False), ForeignKey("actions.id"), primary_key=True)
    tag_id = Column(UUID(as_uuid=False), ForeignKey("tags.id"), primary_key=True)


class DocumentOrm(Base):
    __tablename__ = "documents"
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: uuid.uuid4().hex)
    tenant_id = Column(
        UUID(as_uuid=False), ForeignKey("tenants.id"), nullable=False, index=True
    )
    status = Column(String(32), nullable=False)  # queued | processing | indexed | error
    file_path = Column(String(2048), nullable=True)


class DocumentTagOrm(Base):
    __tablename__ = "document_tags"
    document_id = Column(
        UUID(as_uuid=False), ForeignKey("documents.id"), primary_key=True
    )
    tag_id = Column(UUID(as_uuid=False), ForeignKey("tags.id"), primary_key=True)


class UserPreferencesOrm(Base):
    __tablename__ = "user_preferences"
    id = Column(UUID(as_uuid=False), primary_key=True, default=lambda: uuid.uuid4().hex)
    tenant_id = Column(
        UUID(as_uuid=False), ForeignKey("tenants.id"), nullable=False, index=True
    )
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    theme = Column(String(32), nullable=False, default="system")
    language = Column(String(32), nullable=False, default="es")
    table_density = Column(String(32), nullable=False, default="comfortable")
    metadata_ = Column("metadata", JSONB, nullable=True)
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "user_id", name="uq_user_preferences_tenant_user"
        ),
    )


# Transitional semantic aliases for Sprint 02.5 task-08a.
# They intentionally point to the existing tables/models to keep
# backward compatibility while introducing clearer domain naming.
IntegrationOrm = ConnectorOrm
IntegrationActionOrm = ActionOrm
