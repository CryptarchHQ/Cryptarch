"""
GET /me: session profile for any authenticated user (email, tenant_name, role, sub).
Not admin-only — both admin and user roles must succeed.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from auth.service import hash_password
from config import JWT_ALGORITHM, JWT_SECRET
from dependencies import get_db
from domain.models import Tenant, User
from fastapi.testclient import TestClient
from jose import jwt
from main import app
from sqlalchemy.orm import Session


def _id():
    return uuid.uuid4().hex


def _make_token(tenant_id: str, user_id: str, role: str = "user") -> str:
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
def unnamed_tenant(db_session: Session):
    t = Tenant(id=_id(), name=None)
    db_session.add(t)
    db_session.flush()
    return t


@pytest.fixture
def user(db_session: Session, tenant):
    u = User(
        id=_id(),
        tenant_id=tenant.id,
        email="user@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add(u)
    db_session.flush()
    return u


@pytest.fixture
def admin(db_session: Session, tenant):
    u = User(
        id=_id(),
        tenant_id=tenant.id,
        email="admin@acme.com",
        role="admin",
        password_hash=hash_password("x"),
    )
    db_session.add(u)
    db_session.flush()
    return u


@pytest.fixture
def user_unnamed_tenant(db_session: Session, unnamed_tenant):
    u = User(
        id=_id(),
        tenant_id=unnamed_tenant.id,
        email="u@noname.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add(u)
    db_session.flush()
    return u


@pytest.fixture
def client(db_session: Session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


def test_get_me_requires_auth(client: TestClient):
    r = client.get("/me")
    assert r.status_code == 401


def test_get_me_as_user_returns_profile(client: TestClient, tenant, user):
    r = client.get("/me", headers=_auth_headers(tenant.id, user.id, "user"))
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "email": "user@acme.com",
        "tenant_name": "Acme",
        "role": "user",
        "sub": user.id,
    }


def test_get_me_as_admin_returns_profile(client: TestClient, tenant, admin):
    r = client.get("/me", headers=_auth_headers(tenant.id, admin.id, "admin"))
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "email": "admin@acme.com",
        "tenant_name": "Acme",
        "role": "admin",
        "sub": admin.id,
    }


def test_get_me_tenant_name_null_when_unnamed(
    client: TestClient, unnamed_tenant, user_unnamed_tenant
):
    r = client.get(
        "/me",
        headers=_auth_headers(unnamed_tenant.id, user_unnamed_tenant.id, "user"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["tenant_name"] is None
    assert body["email"] == "u@noname.com"
    assert body["role"] == "user"
    assert body["sub"] == user_unnamed_tenant.id
