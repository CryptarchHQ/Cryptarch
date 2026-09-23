"""
Admin CRUD connectors: list/get/create/update/delete, tenant-scoped.
- All operations use tenant_id from JWT; cross-tenant returns 404.
- DELETE returns 409 if connector has associated actions.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from auth.service import hash_password
from config import JWT_ALGORITHM, JWT_SECRET
from dependencies import get_db
from domain.models import Action, Connector, Tenant, User
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
        name="api.example.com",
        description=None,
        base_url="https://api.example.com",
        auth_config={"type": "bearer"},
    )
    db_session.add(c)
    db_session.flush()
    return c


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


def test_list_connectors_empty_200(client: TestClient, tenant, admin_user):
    r = client.get(
        "/admin/connectors",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 0


def test_list_connectors_tenant_scoped(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_c = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        name="other.com",
        base_url="https://other.com",
        auth_config=None,
    )
    db_session.add(other_c)
    db_session.flush()

    r = client.get(
        "/admin/connectors",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    ids = [c["id"] for c in data]
    assert other_c.id not in ids and str(uuid.UUID(other_c.id)) not in [
        str(uuid.UUID(i)) for i in ids
    ]


def test_list_connectors_unauth_401(client: TestClient):
    r = client.get("/admin/connectors")
    assert r.status_code == 401


def test_list_connectors_non_admin_403(client: TestClient, tenant, db_session: Session):
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
        "/admin/connectors", headers=_auth_headers(tenant.id, u.id, role="user")
    )
    assert r.status_code == 403


# ----- Get by id -----


def test_get_connector_same_tenant_200(
    client: TestClient, tenant, admin_user, connector
):
    r = client.get(
        f"/admin/connectors/{connector.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    assert _uuid_eq(data["id"], connector.id)
    assert data["name"] == "api.example.com"
    assert data["description"] is None
    assert data["base_url"] == "https://api.example.com"
    assert data["auth_config"] == {"type": "bearer"}
    assert _uuid_eq(data["tenant_id"], tenant.id)


def test_get_connector_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_c = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        name="other.com",
        base_url="https://other.com",
        auth_config=None,
    )
    db_session.add(other_c)
    db_session.flush()

    r = client.get(
        f"/admin/connectors/{other_c.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 404


def test_get_connector_not_found_404(client: TestClient, tenant, admin_user):
    r = client.get(
        f"/admin/connectors/{_id()}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 404


# ----- Create -----


def test_create_connector_without_name_422(client: TestClient, tenant, admin_user):
    r = client.post(
        "/admin/connectors",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"base_url": "https://new.example.com"},
    )
    assert r.status_code == 422


def test_create_connector_201(client: TestClient, tenant, admin_user):
    r = client.post(
        "/admin/connectors",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "name": "Nuevo conector",
            "description": "API de ejemplo",
            "base_url": "https://new.example.com",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Nuevo conector"
    assert data["description"] == "API de ejemplo"
    assert data["base_url"] == "https://new.example.com"
    assert data["auth_config"] is None
    assert _uuid_eq(data["tenant_id"], tenant.id)
    assert "id" in data


def test_create_connector_with_auth_config_201(client: TestClient, tenant, admin_user):
    r = client.post(
        "/admin/connectors",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "name": "OAuth API",
            "base_url": "https://api.example.com",
            "auth_config": {"type": "oauth2", "client_id": "x"},
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "OAuth API"
    assert data["description"] is None
    assert data["auth_config"] == {"type": "oauth2", "client_id": "x"}


# ----- Update -----


def test_update_connector_200(client: TestClient, tenant, admin_user, connector):
    r = client.patch(
        f"/admin/connectors/{connector.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "name": "Actualizado",
            "description": "Desc actualizada",
            "base_url": "https://updated.example.com",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Actualizado"
    assert data["description"] == "Desc actualizada"
    assert data["base_url"] == "https://updated.example.com"

    r2 = client.patch(
        f"/admin/connectors/{connector.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"auth_config": {"type": "api_key"}},
    )
    assert r2.status_code == 200
    assert r2.json()["auth_config"] == {"type": "api_key"}


def test_update_connector_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_c = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        name="other.com",
        base_url="https://other.com",
        auth_config=None,
    )
    db_session.add(other_c)
    db_session.flush()

    r = client.patch(
        f"/admin/connectors/{other_c.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"base_url": "https://hacked.com"},
    )
    assert r.status_code == 404


# ----- Delete -----


def test_delete_connector_204(client: TestClient, tenant, admin_user, connector):
    cid = connector.id
    r = client.delete(
        f"/admin/connectors/{cid}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 204

    r2 = client.get(
        f"/admin/connectors/{cid}", headers=_auth_headers(tenant.id, admin_user.id)
    )
    assert r2.status_code == 404


def test_delete_connector_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_c = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        name="other.com",
        base_url="https://other.com",
        auth_config=None,
    )
    db_session.add(other_c)
    db_session.flush()

    r = client.delete(
        f"/admin/connectors/{other_c.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 404


def test_delete_connector_has_actions_409(
    client: TestClient, tenant, admin_user, connector, db_session: Session
):
    action = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=connector.id,
        method="GET",
        path="/items",
        name="List items",
    )
    db_session.add(action)
    db_session.flush()

    r = client.delete(
        f"/admin/connectors/{connector.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 409
