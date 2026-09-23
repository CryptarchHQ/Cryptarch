"""
Admin POST /admin/connectors/{id}/test: probe connector auth without leaking secrets.
- Tenant-scoped (404 cross-tenant / missing).
- Response shape: {ok: bool, detail: str}.
- HTTP is mocked; no real network.
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import httpx
import pytest
from auth.service import hash_password
from config import JWT_ALGORITHM, JWT_SECRET
from dependencies import get_db
from domain.models import Connector, Tenant, User
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


def _auth_headers(tenant_id: str, user_id: str, role: str = "admin"):
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
def client(db_session: Session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


def _mock_response(
    status_code: int = 401, url: str = "https://api.example.com"
) -> httpx.Response:
    request = httpx.Request("GET", url)
    return httpx.Response(status_code, request=request, text="should-not-leak")


def test_connector_test_null_auth_reaches_ok(
    client: TestClient, tenant, admin_user, db_session: Session, monkeypatch
):
    c = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="plain",
        base_url="https://api.example.com",
        auth_config=None,
    )
    db_session.add(c)
    db_session.flush()

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.request.return_value = _mock_response(401)
    monkeypatch.setattr(
        "core.application.connector_test.httpx.Client",
        lambda **kwargs: mock_client,
    )

    r = client.post(
        f"/admin/connectors/{c.id}/test",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    body = r.json()
    assert body == {"ok": True, "detail": body["detail"]}
    assert body["ok"] is True
    assert isinstance(body["detail"], str)
    assert "401" in body["detail"]
    assert "should-not-leak" not in body["detail"]
    mock_client.request.assert_called_once()
    call_kwargs = mock_client.request.call_args
    assert call_kwargs[0][0] == "GET"
    assert call_kwargs[0][1] == "https://api.example.com"
    assert "Authorization" not in (call_kwargs[1].get("headers") or {})


def test_connector_test_missing_env_var_ok_false(
    client: TestClient, tenant, admin_user, db_session: Session, monkeypatch
):
    secret_value = "super-secret-token-value-xyz"
    env_name = "CRYPTARCH_TEST_MISSING_BEARER_TOKEN"
    monkeypatch.delenv(env_name, raising=False)

    c = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="bearer-missing",
        base_url="https://api.example.com",
        auth_config={"type": "bearer", "token_env": env_name},
    )
    db_session.add(c)
    db_session.flush()

    request_spy = MagicMock()
    monkeypatch.setattr(
        "core.application.connector_test.httpx.Client",
        lambda **kwargs: request_spy,
    )

    r = client.post(
        f"/admin/connectors/{c.id}/test",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert env_name in body["detail"]
    assert secret_value not in body["detail"]
    assert secret_value not in r.text
    request_spy.request.assert_not_called()


def test_connector_test_remote_failure_ok_false(
    client: TestClient, tenant, admin_user, db_session: Session, monkeypatch
):
    c = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="unreachable",
        base_url="https://api.example.com",
        auth_config=None,
    )
    db_session.add(c)
    db_session.flush()

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.request.side_effect = httpx.ConnectError("connection refused")
    monkeypatch.setattr(
        "core.application.connector_test.httpx.Client",
        lambda **kwargs: mock_client,
    )

    r = client.post(
        f"/admin/connectors/{c.id}/test",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert isinstance(body["detail"], str)
    assert body["detail"]


def test_connector_test_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_c = Connector(
        id=_id(),
        tenant_id=other_tenant.id,
        name="other",
        base_url="https://other.example.com",
        auth_config=None,
    )
    db_session.add(other_c)
    db_session.flush()

    r = client.post(
        f"/admin/connectors/{other_c.id}/test",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 404


def test_connector_test_bearer_secret_not_in_response(
    client: TestClient, tenant, admin_user, db_session: Session, monkeypatch
):
    env_name = "CRYPTARCH_TEST_BEARER_TOKEN"
    secret_value = "super-secret-token-value-xyz"
    monkeypatch.setenv(env_name, secret_value)

    c = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="bearer-ok",
        base_url="https://api.example.com",
        auth_config={"type": "bearer", "token_env": env_name},
    )
    db_session.add(c)
    db_session.flush()

    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.request.return_value = _mock_response(200)
    monkeypatch.setattr(
        "core.application.connector_test.httpx.Client",
        lambda **kwargs: mock_client,
    )

    r = client.post(
        f"/admin/connectors/{c.id}/test",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert secret_value not in body["detail"]
    assert secret_value not in r.text
    headers = mock_client.request.call_args[1].get("headers") or {}
    assert headers.get("Authorization") == f"Bearer {secret_value}"


def test_connector_test_oauth2_missing_token_url(
    client: TestClient, tenant, admin_user, db_session: Session, monkeypatch
):
    env_name = "CRYPTARCH_TEST_OAUTH_SECRET"
    monkeypatch.setenv(env_name, "oauth-secret")

    c = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="oauth-no-url",
        base_url="https://api.example.com",
        auth_config={
            "type": "oauth2",
            "client_id": "cid",
            "client_secret_env": env_name,
            "scope": "read",
        },
    )
    db_session.add(c)
    db_session.flush()

    r = client.post(
        f"/admin/connectors/{c.id}/test",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert "token_url" in body["detail"].lower()
    assert "oauth-secret" not in body["detail"]
