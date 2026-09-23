"""
Admin CRUD actions: list/get/create/update/delete, tenant-scoped.
- All operations use tenant_id from JWT; connector_id and tag_ids must belong to tenant (404 otherwise).
- Response includes tag_ids; optional filter ?connector_id=uuid on list.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from auth.service import hash_password
from config import JWT_ALGORITHM, JWT_SECRET
from dependencies import get_db
from domain.models import Action, ActionTag, Connector, Tag, Tenant, User
from fastapi.testclient import TestClient
from jose import jwt
from main import app
from sqlalchemy.orm import Session


def _uuid_eq(a: str, b: str) -> bool:
    try:
        return uuid.UUID(str(a)) == uuid.UUID(str(b))
    except (ValueError, TypeError):
        return a == b


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
def admin_user(db_session: Session, tenant):
    u = User(
        id=_id(),
        tenant_id=tenant.id,
        email="admin@acme.com",
        role="admin",
        password_hash=hash_password("secret"),
    )
    db_session.add(u)
    db_session.flush()
    return u


@pytest.fixture
def connector(db_session: Session, tenant):
    c = Connector(
        id=_id(),
        tenant_id=tenant.id,
        base_url="https://api.example.com",
        auth_config=None,
    )
    db_session.add(c)
    db_session.flush()
    return c


@pytest.fixture
def tenant_tags(db_session: Session, tenant):
    t1 = Tag(id=_id(), tenant_id=tenant.id, name="tag-a")
    t2 = Tag(id=_id(), tenant_id=tenant.id, name="tag-b")
    db_session.add_all([t1, t2])
    db_session.flush()
    return [t1, t2]


@pytest.fixture
def client(db_session: Session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


def _auth_headers(tenant_id: str, user_id: str, role: str = "admin"):
    return {"Authorization": f"Bearer {_make_token(tenant_id, user_id, role)}"}


# ----- List -----


def test_list_actions_empty_200(client: TestClient, tenant, admin_user):
    r = client.get(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 0


def test_list_actions_tenant_scoped(
    client: TestClient, tenant, other_tenant, admin_user, connector, db_session: Session
):
    other_conn = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        base_url="https://other.com",
        auth_config=None,
    )
    db_session.add(other_conn)
    db_session.flush()
    other_action = Action(
        id=_id(),
        tenant_id=other_tenant.id,
        connector_id=other_conn.id,
        method="GET",
        path="/other",
        name="Other",
    )
    db_session.add(other_action)
    db_session.flush()

    r = client.get(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    ids = [a["id"] for a in data]
    assert other_action.id not in ids


def test_list_actions_filter_by_connector_id_200(
    client: TestClient, tenant, admin_user, connector, db_session: Session
):
    a1 = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=connector.id,
        method="GET",
        path="/items",
        name="List",
    )
    db_session.add(a1)
    db_session.flush()
    conn2 = Connector(
        id=_id(),
        tenant_id=tenant.id,
        base_url="https://api2.example.com",
        auth_config=None,
    )
    db_session.add(conn2)
    db_session.flush()
    a2 = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=conn2.id,
        method="POST",
        path="/items",
        name="Create",
    )
    db_session.add(a2)
    db_session.flush()

    r = client.get(
        f"/admin/actions?connector_id={str(uuid.UUID(connector.id))}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert _uuid_eq(data[0]["connector_id"], connector.id)
    assert data[0]["name"] == "List"


def test_list_actions_connector_id_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_conn = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        base_url="https://other.com",
        auth_config=None,
    )
    db_session.add(other_conn)
    db_session.flush()

    r = client.get(
        f"/admin/actions?connector_id={str(uuid.UUID(other_conn.id))}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 404


def test_list_actions_unauth_401(client: TestClient):
    r = client.get("/admin/actions")
    assert r.status_code == 401


def test_list_actions_non_admin_403(client: TestClient, tenant, db_session: Session):
    u = User(
        id=_id(),
        tenant_id=tenant.id,
        email="u@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add(u)
    db_session.flush()
    r = client.get(
        "/admin/actions", headers=_auth_headers(tenant.id, u.id, role="user")
    )
    assert r.status_code == 403


# ----- Get by id -----


def test_get_action_same_tenant_200(
    client: TestClient, tenant, admin_user, connector, db_session: Session
):
    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=connector.id,
        method="GET",
        path="/items",
        name="List items",
        request_config={"timeout": 30},
    )
    db_session.add(action)
    db_session.flush()

    r = client.get(
        f"/admin/actions/{action.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    assert _uuid_eq(data["id"], action.id)
    assert data["method"] == "GET"
    assert data["path"] == "/items"
    assert data["name"] == "List items"
    assert data["request_config"] == {"timeout": 30}
    assert data.get("input_schema_json") is None
    assert data.get("input_schema_version") is None
    assert _uuid_eq(data["integration_id"], data["connector_id"])
    assert "tag_ids" in data
    assert data["tag_ids"] == []


def test_get_action_with_tag_ids_200(
    client: TestClient, tenant, admin_user, connector, tenant_tags, db_session: Session
):
    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=connector.id,
        method="GET",
        path="/items",
        name="List",
    )
    db_session.add(action)
    db_session.flush()
    for tag in tenant_tags:
        db_session.add(ActionTag(action_id=action.id, tag_id=tag.id))
    db_session.flush()

    r = client.get(
        f"/admin/actions/{action.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["tag_ids"]) == 2
    expected = {str(uuid.UUID(t.id)) for t in tenant_tags}
    assert set(data["tag_ids"]) == expected


def test_get_action_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_conn = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        base_url="https://other.com",
        auth_config=None,
    )
    db_session.add(other_conn)
    db_session.flush()
    other_action = Action(
        id=_id(),
        tenant_id=other_tenant.id,
        connector_id=other_conn.id,
        method="GET",
        path="/other",
        name="Other",
    )
    db_session.add(other_action)
    db_session.flush()

    r = client.get(
        f"/admin/actions/{other_action.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 404


def test_get_action_not_found_404(client: TestClient, tenant, admin_user):
    r = client.get(
        f"/admin/actions/{_id()}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 404


# ----- Create -----


def test_create_action_201(client: TestClient, tenant, admin_user, connector):
    r = client.post(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "connector_id": str(uuid.UUID(connector.id)),
            "method": "POST",
            "path": "/items",
            "name": "Create item",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["method"] == "POST"
    assert data["path"] == "/items"
    assert data["name"] == "Create item"
    assert _uuid_eq(data["connector_id"], connector.id)
    assert _uuid_eq(data["integration_id"], connector.id)
    assert _uuid_eq(data["tenant_id"], tenant.id)
    assert data["tag_ids"] == []
    assert "id" in data


def test_create_action_with_tag_ids_201(
    client: TestClient, tenant, admin_user, connector, tenant_tags
):
    r = client.post(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "connector_id": str(uuid.UUID(connector.id)),
            "method": "GET",
            "path": "/items",
            "name": "List",
            "tag_ids": [
                str(uuid.UUID(tenant_tags[0].id)),
                str(uuid.UUID(tenant_tags[1].id)),
            ],
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert len(data["tag_ids"]) == 2
    expected = {str(uuid.UUID(t.id)) for t in tenant_tags}
    assert set(data["tag_ids"]) == expected


def test_create_action_connector_not_found_404(client: TestClient, tenant, admin_user):
    """Non-existent connector_id (valid UUID format) -> 404."""
    r = client.post(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "connector_id": str(uuid.uuid4()),
            "method": "GET",
            "path": "/items",
        },
    )
    assert r.status_code == 404


def test_create_action_connector_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_conn = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        base_url="https://other.com",
        auth_config=None,
    )
    db_session.add(other_conn)
    db_session.flush()

    r = client.post(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "connector_id": str(uuid.UUID(other_conn.id)),
            "method": "GET",
            "path": "/items",
        },
    )
    assert r.status_code == 404


def test_create_action_tag_other_tenant_404(
    client: TestClient,
    tenant,
    other_tenant,
    admin_user,
    connector,
    tenant_tags,
    db_session: Session,
):
    other_tag = Tag(id=_id(), tenant_id=other_tenant.id, name="other-tag")
    db_session.add(other_tag)
    db_session.flush()

    r = client.post(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "connector_id": str(uuid.UUID(connector.id)),
            "method": "GET",
            "path": "/items",
            "tag_ids": [
                str(uuid.UUID(tenant_tags[0].id)),
                str(uuid.UUID(other_tag.id)),
            ],
        },
    )
    assert r.status_code == 404


def test_create_action_get_with_request_body_in_config_422(
    client: TestClient, tenant, admin_user, connector
):
    r = client.post(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "connector_id": str(uuid.UUID(connector.id)),
            "method": "GET",
            "path": "/items",
            "request_config": {"body": {"foo": "bar"}},
        },
    )
    assert r.status_code == 422


def test_create_action_post_with_body_in_config_201(
    client: TestClient, tenant, admin_user, connector
):
    r = client.post(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "connector_id": str(uuid.UUID(connector.id)),
            "method": "POST",
            "path": "/items",
            "request_config": {
                "headers": {"Content-Type": "application/json"},
                "body": {"name": "{{title}}"},
            },
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["method"] == "POST"
    assert data["request_config"]["body"] == {"name": "{{title}}"}
    assert data["request_config"]["headers"]["Content-Type"] == "application/json"


def test_create_action_legacy_query_and_body_params_normalized_201(
    client: TestClient, tenant, admin_user, connector
):
    r = client.post(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "connector_id": str(uuid.UUID(connector.id)),
            "method": "POST",
            "path": "/items",
            "request_config": {
                "query_params": {"page": "1"},
                "body_params": {"name": "{{title}}"},
                "timeout": 10,
            },
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["request_config"] == {
        "query": {"page": "1"},
        "body": {"name": "{{title}}"},
        "timeout": 10,
    }
    assert "query_params" not in data["request_config"]
    assert "body_params" not in data["request_config"]

    r2 = client.get(
        f"/admin/actions/{data['id']}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r2.status_code == 200
    got = r2.json()["request_config"]
    assert got == {
        "query": {"page": "1"},
        "body": {"name": "{{title}}"},
        "timeout": 10,
    }
    assert "query_params" not in got
    assert "body_params" not in got


def test_create_action_canonical_wins_over_legacy_keys_201(
    client: TestClient, tenant, admin_user, connector
):
    r = client.post(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "connector_id": str(uuid.UUID(connector.id)),
            "method": "POST",
            "path": "/items",
            "request_config": {
                "query": {"canonical": "q"},
                "query_params": {"legacy": "q"},
                "body": {"canonical": True},
                "body_params": {"legacy": True},
            },
        },
    )
    assert r.status_code == 201
    rc = r.json()["request_config"]
    assert rc == {"query": {"canonical": "q"}, "body": {"canonical": True}}
    assert "query_params" not in rc
    assert "body_params" not in rc


def test_get_action_normalizes_legacy_request_config_in_db(
    client: TestClient, tenant, admin_user, connector, db_session: Session
):
    """Legacy blobs already stored must be remapped on read (API response)."""
    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=connector.id,
        method="POST",
        path="/legacy",
        name="Legacy",
        request_config={
            "query_params": {"q": "1"},
            "body_params": {"x": 2},
            "auth": {"type": "none"},
        },
    )
    db_session.add(action)
    db_session.flush()

    r = client.get(
        f"/admin/actions/{action.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    rc = r.json()["request_config"]
    assert rc == {
        "query": {"q": "1"},
        "body": {"x": 2},
        "auth": {"type": "none"},
    }
    assert "query_params" not in rc
    assert "body_params" not in rc


def test_create_action_invalid_input_schema_422(
    client: TestClient, tenant, admin_user, connector
):
    r = client.post(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "connector_id": str(uuid.UUID(connector.id)),
            "method": "GET",
            "path": "/items",
            "input_schema_json": {"type": "string"},
        },
    )
    assert r.status_code == 422


def test_create_action_rejects_legacy_fields_wrapper_422(
    client: TestClient, tenant, admin_user, connector
):
    r = client.post(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "connector_id": str(uuid.UUID(connector.id)),
            "method": "GET",
            "path": "/items",
            "input_schema_json": {"fields": [{"name": "x", "type": "text"}]},
        },
    )
    assert r.status_code == 422


def test_create_action_persists_input_schema_roundtrip(
    client: TestClient, tenant, admin_user, connector
):
    schema = {"type": "object", "properties": {"x": {"type": "string"}}}
    r = client.post(
        "/admin/actions",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "connector_id": str(uuid.UUID(connector.id)),
            "method": "GET",
            "path": "/items",
            "input_schema_json": schema,
            "input_schema_version": "2020-12",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["input_schema_json"] == schema
    assert data["input_schema_version"] == "2020-12"

    r2 = client.get(
        f"/admin/actions/{data['id']}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r2.status_code == 200
    got = r2.json()
    assert got["input_schema_json"] == schema
    assert got["input_schema_version"] == "2020-12"


def test_update_action_patch_input_schema_200(
    client: TestClient, tenant, admin_user, connector, db_session: Session
):
    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=connector.id,
        method="GET",
        path="/items",
        name="List",
    )
    db_session.add(action)
    db_session.flush()

    schema = {"type": "object"}
    r = client.patch(
        f"/admin/actions/{action.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "input_schema_json": schema,
            "input_schema_version": "draft-07",
        },
    )
    assert r.status_code == 200
    assert r.json()["input_schema_json"] == schema
    assert r.json()["input_schema_version"] == "draft-07"


def test_update_action_method_to_get_with_existing_body_config_422(
    client: TestClient, tenant, admin_user, connector, db_session: Session
):
    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=connector.id,
        method="POST",
        path="/items",
        name="Create",
        request_config={"body": {"a": 1}},
    )
    db_session.add(action)
    db_session.flush()

    r = client.patch(
        f"/admin/actions/{action.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"method": "GET"},
    )
    assert r.status_code == 422


# ----- Update -----


def test_update_action_200(
    client: TestClient, tenant, admin_user, connector, db_session: Session
):
    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=connector.id,
        method="GET",
        path="/old",
        name="Old",
    )
    db_session.add(action)
    db_session.flush()

    r = client.patch(
        f"/admin/actions/{action.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"method": "POST", "path": "/new", "name": "New"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["method"] == "POST"
    assert data["path"] == "/new"
    assert data["name"] == "New"


def test_update_action_tag_ids_200(
    client: TestClient, tenant, admin_user, connector, tenant_tags, db_session: Session
):
    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=connector.id,
        method="GET",
        path="/items",
        name="List",
    )
    db_session.add(action)
    db_session.flush()

    r = client.patch(
        f"/admin/actions/{action.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "tag_ids": [
                str(uuid.UUID(tenant_tags[0].id)),
                str(uuid.UUID(tenant_tags[1].id)),
            ]
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["tag_ids"]) == 2


def test_update_action_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_conn = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        base_url="https://other.com",
        auth_config=None,
    )
    db_session.add(other_conn)
    db_session.flush()
    other_action = Action(
        id=_id(),
        tenant_id=other_tenant.id,
        connector_id=other_conn.id,
        method="GET",
        path="/other",
        name="Other",
    )
    db_session.add(other_action)
    db_session.flush()

    r = client.patch(
        f"/admin/actions/{other_action.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"name": "Hacked"},
    )
    assert r.status_code == 404


# ----- Delete -----


def test_delete_action_204(
    client: TestClient, tenant, admin_user, connector, db_session: Session
):
    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=connector.id,
        method="GET",
        path="/items",
        name="List",
    )
    db_session.add(action)
    db_session.flush()
    aid = action.id

    r = client.delete(
        f"/admin/actions/{aid}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 204

    r2 = client.get(
        f"/admin/actions/{aid}", headers=_auth_headers(tenant.id, admin_user.id)
    )
    assert r2.status_code == 404


def test_delete_action_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_conn = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        base_url="https://other.com",
        auth_config=None,
    )
    db_session.add(other_conn)
    db_session.flush()
    other_action = Action(
        id=_id(),
        tenant_id=other_tenant.id,
        connector_id=other_conn.id,
        method="GET",
        path="/other",
        name="Other",
    )
    db_session.add(other_action)
    db_session.flush()

    r = client.delete(
        f"/admin/actions/{other_action.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 404
