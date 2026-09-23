"""
Admin filter preview: POST /admin/filters/preview counts matching entities (AND tags).
Does not persist. Tenant-scoped; unknown tags -> 404; invalid target_type -> 422.
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
    Document,
    DocumentTag,
    Tag,
    Tenant,
    User,
    UserTag,
)
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
    return {"Authorization": "Bearer " + _make_token(tenant_id, user_id, role)}


def test_preview_and_semantics_users(
    client: TestClient, tenant, admin_user, tenant_tags, db_session: Session
):
    """Only entities with ALL requested tags (AND) are counted."""
    tag_a, tag_b = tenant_tags
    both = User(
        id=_id(),
        tenant_id=tenant.id,
        email="both@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    only_a = User(
        id=_id(),
        tenant_id=tenant.id,
        email="onlya@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add_all([both, only_a])
    db_session.flush()
    db_session.add(UserTag(user_id=both.id, tag_id=tag_a.id))
    db_session.add(UserTag(user_id=both.id, tag_id=tag_b.id))
    db_session.add(UserTag(user_id=only_a.id, tag_id=tag_a.id))
    db_session.flush()

    r = client.post(
        "/admin/filters/preview",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "target_type": "user",
            "tag_ids": [str(tag_a.id), str(tag_b.id)],
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 1
    assert len(data["sample"]) == 1
    assert _uuid_eq(data["sample"][0]["id"], both.id)
    assert data["sample"][0]["label"] == "both@acme.com"


def test_preview_empty_tag_ids_counts_all_of_type(
    client: TestClient, tenant, admin_user, db_session: Session
):
    # Empty tag_ids: a filter with no tags does not restrict; count all entities of that type in tenant.
    for email in ("a@acme.com", "b@acme.com", "c@acme.com"):
        db_session.add(
            User(
                id=_id(),
                tenant_id=tenant.id,
                email=email,
                role="user",
                password_hash=hash_password("x"),
            )
        )
    db_session.flush()

    r = client.post(
        "/admin/filters/preview",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"target_type": "user", "tag_ids": []},
    )
    assert r.status_code == 200
    data = r.json()
    # admin_user + 3 users
    assert data["count"] == 4
    assert len(data["sample"]) <= 5


def test_preview_tenant_isolation(
    client: TestClient,
    tenant,
    other_tenant,
    admin_user,
    tenant_tags,
    db_session: Session,
):
    """Preview must not count rows from another tenant."""
    tag_a = tenant_tags[0]
    other_tag = Tag(id=_id(), tenant_id=other_tenant.id, name="tag-a")
    db_session.add(other_tag)
    db_session.flush()

    ours = User(
        id=_id(),
        tenant_id=tenant.id,
        email="ours@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    theirs = User(
        id=_id(),
        tenant_id=other_tenant.id,
        email="theirs@other.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add_all([ours, theirs])
    db_session.flush()
    db_session.add(UserTag(user_id=ours.id, tag_id=tag_a.id))
    db_session.add(UserTag(user_id=theirs.id, tag_id=other_tag.id))
    db_session.flush()

    r = client.post(
        "/admin/filters/preview",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"target_type": "user", "tag_ids": [str(tag_a.id)]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 1
    assert all(not _uuid_eq(s["id"], theirs.id) for s in data["sample"])
    assert _uuid_eq(data["sample"][0]["id"], ours.id)


def test_preview_tag_not_found_404(client: TestClient, tenant, admin_user, tenant_tags):
    r = client.post(
        "/admin/filters/preview",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "target_type": "user",
            "tag_ids": [str(tenant_tags[0].id), _id()],
        },
    )
    assert r.status_code == 404


def test_preview_tag_other_tenant_404(
    client: TestClient,
    tenant,
    other_tenant,
    admin_user,
    db_session: Session,
):
    other_tag = Tag(id=_id(), tenant_id=other_tenant.id, name="foreign")
    db_session.add(other_tag)
    db_session.flush()
    r = client.post(
        "/admin/filters/preview",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"target_type": "user", "tag_ids": [str(other_tag.id)]},
    )
    assert r.status_code == 404


def test_preview_invalid_target_type_422(client: TestClient, tenant, admin_user):
    r = client.post(
        "/admin/filters/preview",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"target_type": "invalid", "tag_ids": []},
    )
    assert r.status_code == 422


def test_preview_sample_max_five_and_action_label(
    client: TestClient, tenant, admin_user, tenant_tags, db_session: Session
):
    tag_a = tenant_tags[0]
    conn = Connector(
        id=_id(),
        tenant_id=tenant.id,
        name="C",
        base_url="https://example.com",
    )
    db_session.add(conn)
    db_session.flush()
    for i in range(7):
        a = Action(
            id=_id(),
            tenant_id=tenant.id,
            connector_id=conn.id,
            method="GET",
            path=f"/{i}",
            name=f"Action-{i}",
        )
        db_session.add(a)
        db_session.flush()
        db_session.add(ActionTag(action_id=a.id, tag_id=tag_a.id))
    db_session.flush()

    r = client.post(
        "/admin/filters/preview",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"target_type": "action", "tag_ids": [str(tag_a.id)]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 7
    assert len(data["sample"]) == 5
    assert all(s["label"].startswith("Action-") for s in data["sample"])


def test_preview_document_label_file_path_or_id(
    client: TestClient, tenant, admin_user, tenant_tags, db_session: Session
):
    tag_a = tenant_tags[0]
    with_path = Document(
        id=_id(), tenant_id=tenant.id, status="queued", file_path="/docs/a.pdf"
    )
    no_path_id = _id()
    without_path = Document(
        id=no_path_id, tenant_id=tenant.id, status="queued", file_path=None
    )
    db_session.add_all([with_path, without_path])
    db_session.flush()
    db_session.add(DocumentTag(document_id=with_path.id, tag_id=tag_a.id))
    db_session.add(DocumentTag(document_id=without_path.id, tag_id=tag_a.id))
    db_session.flush()

    r = client.post(
        "/admin/filters/preview",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"target_type": "document", "tag_ids": [str(tag_a.id)]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 2
    path_entry = next(s for s in data["sample"] if _uuid_eq(s["id"], with_path.id))
    no_path_entry = next(s for s in data["sample"] if _uuid_eq(s["id"], no_path_id))
    assert path_entry["label"] == "/docs/a.pdf"
    assert _uuid_eq(no_path_entry["label"], no_path_id)


def test_preview_unauth_401(client: TestClient):
    r = client.post(
        "/admin/filters/preview",
        json={"target_type": "user", "tag_ids": []},
    )
    assert r.status_code == 401


def test_preview_non_admin_403(client: TestClient, tenant, db_session: Session):
    u = User(
        id=_id(),
        tenant_id=tenant.id,
        email="user@acme.com",
        role="user",
        password_hash=hash_password("x"),
    )
    db_session.add(u)
    db_session.flush()
    r = client.post(
        "/admin/filters/preview",
        headers=_auth_headers(tenant.id, u.id, role="user"),
        json={"target_type": "user", "tag_ids": []},
    )
    assert r.status_code == 403
