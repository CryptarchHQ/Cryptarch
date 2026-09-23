"""
GET /actions: lista de acciones permitidas para el usuario autenticado (permisos efectivos).
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
from shared_contract import ROLE_ADMIN
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


def test_list_actions_requires_auth(client: TestClient):
    r = client.get("/actions")
    assert r.status_code == 401


def test_user_sees_only_permitted_actions(
    client: TestClient, tenant, db_session: Session
):
    tag_a = Tag(id=_id(), tenant_id=tenant.id, name="a")
    tag_b = Tag(id=_id(), tenant_id=tenant.id, name="b")
    db_session.add_all([tag_a, tag_b])
    db_session.flush()

    user = User(
        id=_id(),
        tenant_id=tenant.id,
        email="u@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add(user)
    db_session.add(UserTag(user_id=user.id, tag_id=tag_a.id))
    db_session.flush()

    conn = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="Test connector",
        base_url="https://api.example.com",
    )
    db_session.add(conn)
    db_session.flush()

    actions = []
    for name, t in [("one", tag_a), ("two", tag_b), ("three", tag_b)]:
        a = Action(
            id=_id(),
            tenant_id=tenant.id,
            connector_id=conn.id,
            method="GET",
            path=f"/{name}",
            name=name,
        )
        db_session.add(a)
        db_session.add(ActionTag(action_id=a.id, tag_id=t.id))
        actions.append(a)
    db_session.flush()
    a1, a2, a3 = actions

    f_user = SavedFilter(
        id=_id(), tenant_id=tenant.id, target_type="user", name="user-a"
    )
    db_session.add(f_user)
    db_session.add(SavedFilterTag(saved_filter_id=f_user.id, tag_id=tag_a.id))
    f_act = SavedFilter(
        id=_id(), tenant_id=tenant.id, target_type="action", name="only-a"
    )
    db_session.add(f_act)
    db_session.add(SavedFilterTag(saved_filter_id=f_act.id, tag_id=tag_a.id))
    db_session.flush()

    g = Group(id=_id(), tenant_id=tenant.id, name="G")
    db_session.add(g)
    db_session.flush()
    db_session.add(GroupUserFilter(group_id=g.id, saved_filter_id=f_user.id))
    db_session.add(GroupActionFilter(group_id=g.id, saved_filter_id=f_act.id))
    db_session.flush()

    r = client.get("/actions", headers=_auth_headers(tenant.id, user.id))
    assert r.status_code == 200
    data = r.json()
    ids = {item["id"].replace("-", "") for item in data}
    assert ids == {str(a1.id).replace("-", "")}
    assert str(a2.id).replace("-", "") not in ids
    assert str(a3.id).replace("-", "") not in ids
    assert len(data) == 1
    assert data[0]["method"] == "GET"
    assert data[0]["path"] == "/one"


def test_user_with_no_groups_sees_empty_list(
    client: TestClient, tenant, db_session: Session
):
    user = User(
        id=_id(),
        tenant_id=tenant.id,
        email="lonely@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add(user)
    db_session.flush()

    r = client.get("/actions", headers=_auth_headers(tenant.id, user.id))
    assert r.status_code == 200
    assert r.json() == []


def test_admin_user_sees_only_permitted_actions(
    client: TestClient, tenant, db_session: Session
):
    tag_u = Tag(id=_id(), tenant_id=tenant.id, name="user-tag")
    tag_allowed = Tag(id=_id(), tenant_id=tenant.id, name="allowed-tag")
    tag_other = Tag(id=_id(), tenant_id=tenant.id, name="other-tag")
    db_session.add_all([tag_u, tag_allowed, tag_other])
    db_session.flush()

    admin = User(
        id=_id(),
        tenant_id=tenant.id,
        email="admin@acme.com",
        role=ROLE_ADMIN,
        password_hash=hash_password("x"),
    )
    db_session.add(admin)
    db_session.add(UserTag(user_id=admin.id, tag_id=tag_u.id))
    db_session.flush()

    conn = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="Test connector",
        base_url="https://api.example.com",
    )
    db_session.add(conn)
    db_session.flush()

    allowed = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=conn.id,
        method="GET",
        path="/ok",
        name="allowed",
    )
    other = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=conn.id,
        method="GET",
        path="/nope",
        name="other",
    )
    db_session.add_all([allowed, other])
    db_session.add(ActionTag(action_id=allowed.id, tag_id=tag_allowed.id))
    db_session.add(ActionTag(action_id=other.id, tag_id=tag_other.id))
    db_session.flush()

    f_user = SavedFilter(id=_id(), tenant_id=tenant.id, target_type="user", name="u")
    db_session.add(f_user)
    db_session.add(SavedFilterTag(saved_filter_id=f_user.id, tag_id=tag_u.id))
    f_act = SavedFilter(id=_id(), tenant_id=tenant.id, target_type="action", name="a")
    db_session.add(f_act)
    db_session.add(SavedFilterTag(saved_filter_id=f_act.id, tag_id=tag_allowed.id))
    db_session.flush()

    g = Group(id=_id(), tenant_id=tenant.id, name="G")
    db_session.add(g)
    db_session.flush()
    db_session.add(GroupUserFilter(group_id=g.id, saved_filter_id=f_user.id))
    db_session.add(GroupActionFilter(group_id=g.id, saved_filter_id=f_act.id))
    db_session.flush()

    r = client.get("/actions", headers=_auth_headers(tenant.id, admin.id, ROLE_ADMIN))
    assert r.status_code == 200
    ids = {item["id"] for item in r.json()}
    assert len(r.json()) == 1
    assert str(uuid.UUID(allowed.id)) in ids or allowed.id in ids


def test_cross_tenant_not_returned(
    client: TestClient, tenant, other_tenant, db_session: Session
):
    tag1 = Tag(id=_id(), tenant_id=tenant.id, name="t1")
    tag2 = Tag(id=_id(), tenant_id=other_tenant.id, name="t2")
    db_session.add_all([tag1, tag2])
    db_session.flush()

    user = User(
        id=_id(),
        tenant_id=tenant.id,
        email="u@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add(user)
    db_session.add(UserTag(user_id=user.id, tag_id=tag1.id))
    db_session.flush()

    conn1 = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="Test connector",
        base_url="https://a.com",
    )
    conn2 = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        name="Test connector",
        base_url="https://b.com",
    )
    db_session.add_all([conn1, conn2])
    db_session.flush()

    action_home = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=conn1.id,
        method="GET",
        path="/",
        name="home",
    )
    action_other = Action(
        id=_id(),
        tenant_id=other_tenant.id,
        connector_id=conn2.id,
        method="GET",
        path="/",
        name="other",
    )
    db_session.add_all([action_home, action_other])
    db_session.add(ActionTag(action_id=action_home.id, tag_id=tag1.id))
    db_session.add(ActionTag(action_id=action_other.id, tag_id=tag2.id))
    db_session.flush()

    f_user = SavedFilter(id=_id(), tenant_id=tenant.id, target_type="user", name="u1")
    db_session.add(f_user)
    db_session.add(SavedFilterTag(saved_filter_id=f_user.id, tag_id=tag1.id))
    f_act = SavedFilter(id=_id(), tenant_id=tenant.id, target_type="action", name="a1")
    db_session.add(f_act)
    db_session.add(SavedFilterTag(saved_filter_id=f_act.id, tag_id=tag1.id))
    db_session.flush()

    g = Group(id=_id(), tenant_id=tenant.id, name="G1")
    db_session.add(g)
    db_session.flush()
    db_session.add(GroupUserFilter(group_id=g.id, saved_filter_id=f_user.id))
    db_session.add(GroupActionFilter(group_id=g.id, saved_filter_id=f_act.id))
    db_session.flush()

    r = client.get("/actions", headers=_auth_headers(tenant.id, user.id))
    assert r.status_code == 200
    ids = {uuid.UUID(x["id"]) for x in r.json()}
    assert uuid.UUID(action_home.id) in ids
    assert uuid.UUID(action_other.id) not in ids


def test_response_does_not_expose_request_config_or_credentials(
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
    db_session.add(UserTag(user_id=user.id, tag_id=tag.id))
    db_session.flush()

    secret_cfg = {"Authorization": "Bearer SUPER_SECRET"}
    conn = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="Test connector",
        base_url="https://api.example.com",
        auth_config=secret_cfg,
    )
    db_session.add(conn)
    db_session.flush()

    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=conn.id,
        method="POST",
        path="/exec",
        name="act",
        request_config={"body": {"key": "REQUEST_CFG_SECRET"}},
        input_schema_json={"type": "object"},
        input_schema_version="1",
    )
    db_session.add(action)
    db_session.add(ActionTag(action_id=action.id, tag_id=tag.id))
    db_session.flush()

    f_user = SavedFilter(id=_id(), tenant_id=tenant.id, target_type="user", name="u")
    db_session.add(f_user)
    db_session.add(SavedFilterTag(saved_filter_id=f_user.id, tag_id=tag.id))
    f_act = SavedFilter(id=_id(), tenant_id=tenant.id, target_type="action", name="a")
    db_session.add(f_act)
    db_session.add(SavedFilterTag(saved_filter_id=f_act.id, tag_id=tag.id))
    db_session.flush()

    g = Group(id=_id(), tenant_id=tenant.id, name="G")
    db_session.add(g)
    db_session.flush()
    db_session.add(GroupUserFilter(group_id=g.id, saved_filter_id=f_user.id))
    db_session.add(GroupActionFilter(group_id=g.id, saved_filter_id=f_act.id))
    db_session.flush()

    r = client.get("/actions", headers=_auth_headers(tenant.id, user.id))
    assert r.status_code == 200
    payload = r.json()
    assert len(payload) == 1
    body = payload[0]
    assert body["method"] == "POST"
    assert body["path"] == "/exec"
    assert body["input_schema_json"] == {"type": "object"}
    assert body["input_schema_version"] == "1"
    assert "request_config" not in body
    assert "auth_config" not in body
    assert "base_url" not in body
    raw = r.text
    assert "SUPER_SECRET" not in raw
    assert "REQUEST_CFG_SECRET" not in raw
