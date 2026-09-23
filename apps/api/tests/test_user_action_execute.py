"""
POST /actions/{action_id}/execute: stub execution with permissions and payload validation.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from auth.service import hash_password
from config import JWT_ALGORITHM, JWT_SECRET
from dependencies import get_db
from domain.models import (
    Action,
    ActionTag,
    Connector,
    Group,
    GroupActionFilter,
    GroupUserFilter,
    SavedFilter,
    SavedFilterTag,
    Tag,
    Tenant,
    User,
    UserTag,
)
from fastapi.testclient import TestClient
from jose import jwt
from main import app
from sqlalchemy.orm import Session


def _id():
    return uuid.uuid4().hex


def _make_token(tenant_id: str, user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "exp": datetime.now(UTC) + timedelta(hours=1),
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _auth_headers(tenant_id: str, user_id: str, role: str = "user"):
    return {"Authorization": f"Bearer {_make_token(tenant_id, user_id, role)}"}


def _execute_url(action_id: str) -> str:
    return f"/actions/{action_id}/execute"


@pytest.fixture
def tenant(db_session: Session):
    t = Tenant(id=_id(), name="Acme")
    db_session.add(t)
    db_session.flush()
    return t


@pytest.fixture
def other_tenant(db_session: Session):
    t = Tenant(id=_id(), name="OtherCo")
    db_session.add(t)
    db_session.flush()
    return t


@pytest.fixture
def client(db_session: Session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


def _grant_user_action_via_group(
    db_session: Session,
    tenant: Tenant,
    user: User,
    action: Action,
    user_tag: Tag,
    action_tag: Tag,
) -> None:
    db_session.add(UserTag(user_id=user.id, tag_id=user_tag.id))
    db_session.flush()

    f_user = SavedFilter(
        id=_id(), tenant_id=tenant.id, target_type="user", name="user-filter"
    )
    db_session.add(f_user)
    db_session.add(SavedFilterTag(saved_filter_id=f_user.id, tag_id=user_tag.id))
    f_act = SavedFilter(
        id=_id(), tenant_id=tenant.id, target_type="action", name="action-filter"
    )
    db_session.add(f_act)
    db_session.add(SavedFilterTag(saved_filter_id=f_act.id, tag_id=action_tag.id))
    db_session.flush()

    g = Group(id=_id(), tenant_id=tenant.id, name="G")
    db_session.add(g)
    db_session.flush()
    db_session.add(GroupUserFilter(group_id=g.id, saved_filter_id=f_user.id))
    db_session.add(GroupActionFilter(group_id=g.id, saved_filter_id=f_act.id))
    db_session.flush()


def test_execute_requires_auth(client: TestClient):
    r = client.post(_execute_url(_id()), json={"payload": {}})
    assert r.status_code == 401


def test_execute_success_stub(client: TestClient, tenant, db_session: Session):
    tag = Tag(id=_id(), tenant_id=tenant.id, name="t")
    db_session.add(tag)
    db_session.flush()

    user = User(
        id=_id(),
        tenant_id=tenant.id,
        email="u@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add(user)
    db_session.flush()

    conn = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="Test connector",
        base_url="https://api.example.com",
        auth_config={"Authorization": "Bearer SECRET"},
    )
    db_session.add(conn)
    db_session.flush()

    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=conn.id,
        method="POST",
        path="/run",
        name="run",
        request_config={"body": {"hidden": True}},
        input_schema_json={
            "type": "object",
            "properties": {"q": {"type": "string"}},
            "required": ["q"],
        },
        input_schema_version="1",
    )
    db_session.add(action)
    db_session.add(ActionTag(action_id=action.id, tag_id=tag.id))
    db_session.flush()

    _grant_user_action_via_group(db_session, tenant, user, action, tag, tag)

    body = {"payload": {"q": "hello"}}
    r = client.post(
        _execute_url(action.id),
        json=body,
        headers=_auth_headers(tenant.id, user.id),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "stub" in data["message"].lower()
    assert data["received_payload"] == {"q": "hello"}
    assert uuid.UUID(data["action_id"]) == uuid.UUID(action.id)
    raw = r.text
    assert "SECRET" not in raw
    assert "hidden" not in raw


def test_execute_forbidden_without_permission(
    client: TestClient, tenant, db_session: Session
):
    tag_user = Tag(id=_id(), tenant_id=tenant.id, name="u")
    tag_action = Tag(id=_id(), tenant_id=tenant.id, name="a")
    db_session.add_all([tag_user, tag_action])
    db_session.flush()

    user = User(
        id=_id(),
        tenant_id=tenant.id,
        email="u@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add(user)
    db_session.add(UserTag(user_id=user.id, tag_id=tag_user.id))
    db_session.flush()

    conn = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="Test connector",
        base_url="https://api.example.com",
    )
    db_session.add(conn)
    db_session.flush()

    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=conn.id,
        method="GET",
        path="/x",
        name="x",
        input_schema_json={"type": "object", "properties": {}},
    )
    db_session.add(action)
    db_session.add(ActionTag(action_id=action.id, tag_id=tag_action.id))
    db_session.flush()

    r = client.post(
        _execute_url(action.id),
        json={"payload": {}},
        headers=_auth_headers(tenant.id, user.id),
    )
    assert r.status_code == 403


def test_execute_cross_tenant_blocked(
    client: TestClient, tenant, other_tenant, db_session: Session
):
    tag = Tag(id=_id(), tenant_id=tenant.id, name="t")
    db_session.add(tag)
    db_session.flush()

    user = User(
        id=_id(),
        tenant_id=tenant.id,
        email="u@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add(user)
    db_session.flush()

    conn_other = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        name="Test connector",
        base_url="https://other.com",
    )
    db_session.add(conn_other)
    db_session.flush()

    other_action = Action(
        id=_id(),
        tenant_id=other_tenant.id,
        connector_id=conn_other.id,
        method="GET",
        path="/",
        name="other",
        input_schema_json={"type": "object", "properties": {}},
    )
    db_session.add(other_action)
    db_session.flush()

    r = client.post(
        _execute_url(other_action.id),
        json={"payload": {}},
        headers=_auth_headers(tenant.id, user.id),
    )
    assert r.status_code == 404


def test_execute_invalid_payload_missing_required(
    client: TestClient, tenant, db_session: Session
):
    tag = Tag(id=_id(), tenant_id=tenant.id, name="t")
    db_session.add(tag)
    db_session.flush()

    user = User(
        id=_id(),
        tenant_id=tenant.id,
        email="u@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add(user)
    db_session.flush()

    conn = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="Test connector",
        base_url="https://api.example.com",
    )
    db_session.add(conn)
    db_session.flush()

    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=conn.id,
        method="POST",
        path="/run",
        name="run",
        input_schema_json={
            "type": "object",
            "properties": {"q": {"type": "string"}},
            "required": ["q"],
        },
    )
    db_session.add(action)
    db_session.add(ActionTag(action_id=action.id, tag_id=tag.id))
    db_session.flush()

    _grant_user_action_via_group(db_session, tenant, user, action, tag, tag)

    r = client.post(
        _execute_url(action.id),
        json={"payload": {}},
        headers=_auth_headers(tenant.id, user.id),
    )
    assert r.status_code == 422


def test_execute_invalid_payload_wrong_type(
    client: TestClient, tenant, db_session: Session
):
    tag = Tag(id=_id(), tenant_id=tenant.id, name="t")
    db_session.add(tag)
    db_session.flush()

    user = User(
        id=_id(),
        tenant_id=tenant.id,
        email="u@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add(user)
    db_session.flush()

    conn = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="Test connector",
        base_url="https://api.example.com",
    )
    db_session.add(conn)
    db_session.flush()

    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=conn.id,
        method="POST",
        path="/run",
        name="run",
        input_schema_json={
            "type": "object",
            "properties": {"count": {"type": "integer"}},
        },
    )
    db_session.add(action)
    db_session.add(ActionTag(action_id=action.id, tag_id=tag.id))
    db_session.flush()

    _grant_user_action_via_group(db_session, tenant, user, action, tag, tag)

    r = client.post(
        _execute_url(action.id),
        json={"payload": {"count": "not-a-number"}},
        headers=_auth_headers(tenant.id, user.id),
    )
    assert r.status_code == 422
