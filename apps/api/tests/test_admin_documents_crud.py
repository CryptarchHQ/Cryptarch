"""
Admin CRUD documents (metadata): list/get/create/update/delete, tenant-scoped.
- All operations use tenant_id from JWT; cross-tenant returns 404.
- POST body: status (default queued), file_path optional, tag_ids optional.
- Responses include tag_ids in get/list. tag_ids validated against tenant in create/update.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from auth.service import hash_password
from config import JWT_ALGORITHM, JWT_SECRET
from dependencies import get_db
from domain.models import Document, DocumentTag, Tag, Tenant, User
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
def tag_a(db_session: Session, tenant):
    t = Tag(id=_id(), tenant_id=tenant.id, name="tag-a")
    db_session.add(t)
    db_session.flush()
    return t


@pytest.fixture
def tag_b(db_session: Session, tenant):
    t = Tag(id=_id(), tenant_id=tenant.id, name="tag-b")
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


def _auth_headers(tenant_id: str, user_id: str, role: str = "admin"):
    return {"Authorization": f"Bearer {_make_token(tenant_id, user_id, role)}"}


# ----- List -----


def test_list_documents_empty_200(client: TestClient, tenant, admin_user):
    """GET /admin/documents returns 200 and [] when no documents."""
    r = client.get(
        "/admin/documents",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 0


def test_list_documents_tenant_scoped(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    """Documents from other tenant are not returned."""
    other_doc = Document(
        id=_id(),
        tenant_id=other_tenant.id,
        status="queued",
        file_path="/other/file.pdf",
    )
    db_session.add(other_doc)
    db_session.flush()

    r = client.get(
        "/admin/documents",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    ids = [d["id"] for d in data]
    assert other_doc.id not in ids and str(uuid.UUID(other_doc.id)) not in [
        str(uuid.UUID(i)) for i in ids
    ]


def test_list_documents_returns_tag_ids(
    client: TestClient, tenant, admin_user, db_session: Session, tag_a
):
    """List response includes tag_ids for each document."""
    doc = Document(
        id=_id(),
        tenant_id=tenant.id,
        status="indexed",
        file_path="/docs/a.pdf",
    )
    db_session.add(doc)
    db_session.flush()
    db_session.add(DocumentTag(document_id=doc.id, tag_id=tag_a.id))
    db_session.flush()

    r = client.get(
        "/admin/documents",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert "tag_ids" in data[0]
    assert _uuid_eq(data[0]["tag_ids"][0], tag_a.id)


def test_list_documents_includes_original_filename_and_uploaded_at(
    client: TestClient, tenant, admin_user, db_session: Session
):
    """List exposes original_filename and uploaded_at (null when unset)."""
    uploaded_at = datetime(2025, 1, 10, 8, 30, 0, tzinfo=UTC)
    with_meta = Document(
        id=_id(),
        tenant_id=tenant.id,
        status="queued",
        file_path="/docs/with.pdf",
        original_filename="informe.pdf",
        uploaded_at=uploaded_at,
    )
    without_meta = Document(
        id=_id(),
        tenant_id=tenant.id,
        status="queued",
        file_path="/docs/legacy.pdf",
    )
    db_session.add(with_meta)
    db_session.add(without_meta)
    db_session.flush()

    r = client.get(
        "/admin/documents",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    by_path = {d["file_path"]: d for d in r.json()}
    assert by_path["/docs/with.pdf"]["original_filename"] == "informe.pdf"
    assert by_path["/docs/with.pdf"]["uploaded_at"] is not None
    assert by_path["/docs/legacy.pdf"]["original_filename"] is None
    assert by_path["/docs/legacy.pdf"]["uploaded_at"] is None


def test_list_documents_unauth_401(client: TestClient):
    r = client.get("/admin/documents")
    assert r.status_code == 401


def test_list_documents_non_admin_403(client: TestClient, tenant, db_session: Session):
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
        "/admin/documents", headers=_auth_headers(tenant.id, u.id, role="user")
    )
    assert r.status_code == 403


# ----- Get by id -----


def test_get_document_same_tenant_200(
    client: TestClient, tenant, admin_user, db_session: Session
):
    doc = Document(
        id=_id(),
        tenant_id=tenant.id,
        status="queued",
        file_path="/uploads/doc.pdf",
    )
    db_session.add(doc)
    db_session.flush()

    r = client.get(
        f"/admin/documents/{doc.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    assert _uuid_eq(data["id"], doc.id)
    assert data["status"] == "queued"
    assert data["file_path"] == "/uploads/doc.pdf"
    assert _uuid_eq(data["tenant_id"], tenant.id)
    assert data["tag_ids"] == []


def test_get_document_with_tag_ids_200(
    client: TestClient, tenant, admin_user, db_session: Session, tag_a, tag_b
):
    doc = Document(
        id=_id(),
        tenant_id=tenant.id,
        status="indexed",
        file_path=None,
    )
    db_session.add(doc)
    db_session.flush()
    db_session.add(DocumentTag(document_id=doc.id, tag_id=tag_a.id))
    db_session.add(DocumentTag(document_id=doc.id, tag_id=tag_b.id))
    db_session.flush()

    r = client.get(
        f"/admin/documents/{doc.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["tag_ids"]) == 2
    assert _uuid_eq(data["tag_ids"][0], tag_a.id) or _uuid_eq(
        data["tag_ids"][1], tag_a.id
    )
    assert _uuid_eq(data["tag_ids"][0], tag_b.id) or _uuid_eq(
        data["tag_ids"][1], tag_b.id
    )


def test_get_document_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_doc = Document(
        id=_id(),
        tenant_id=other_tenant.id,
        status="queued",
        file_path="/other/file.pdf",
    )
    db_session.add(other_doc)
    db_session.flush()

    r = client.get(
        f"/admin/documents/{other_doc.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 404


def test_get_document_not_found_404(client: TestClient, tenant, admin_user):
    r = client.get(
        f"/admin/documents/{_id()}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 404


# ----- Create -----


def test_create_document_201_default_status(client: TestClient, tenant, admin_user):
    """POST without body or minimal body uses status=queued."""
    r = client.post(
        "/admin/documents",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "queued"
    assert data["file_path"] is None
    assert data["tag_ids"] == []
    assert _uuid_eq(data["tenant_id"], tenant.id)
    assert "id" in data


def test_create_document_201_with_file_path(client: TestClient, tenant, admin_user):
    r = client.post(
        "/admin/documents",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"file_path": "/uploads/report.pdf"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["file_path"] == "/uploads/report.pdf"
    assert data["status"] == "queued"


def test_create_document_201_with_tag_ids(
    client: TestClient, tenant, admin_user, tag_a, tag_b
):
    r = client.post(
        "/admin/documents",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={
            "status": "queued",
            "tag_ids": [str(tag_a.id), str(tag_b.id)],
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert len(data["tag_ids"]) == 2
    assert _uuid_eq(data["tag_ids"][0], tag_a.id) or _uuid_eq(
        data["tag_ids"][1], tag_a.id
    )
    assert _uuid_eq(data["tag_ids"][0], tag_b.id) or _uuid_eq(
        data["tag_ids"][1], tag_b.id
    )


def test_create_document_tag_ids_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    """tag_ids from another tenant must return 404 (Tag not found)."""
    other_tag = Tag(
        id=_id(),
        tenant_id=other_tenant.id,
        name="other-tag",
    )
    db_session.add(other_tag)
    db_session.flush()

    r = client.post(
        "/admin/documents",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"tag_ids": [str(other_tag.id)]},
    )
    assert r.status_code == 404


def test_create_document_tag_ids_invalid_uuid_422(
    client: TestClient, tenant, admin_user
):
    r = client.post(
        "/admin/documents",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"tag_ids": ["not-a-uuid"]},
    )
    assert r.status_code == 422


# ----- Update -----


def test_update_document_200(
    client: TestClient, tenant, admin_user, db_session: Session
):
    doc = Document(
        id=_id(),
        tenant_id=tenant.id,
        status="queued",
        file_path="/old.pdf",
    )
    db_session.add(doc)
    db_session.flush()

    r = client.patch(
        f"/admin/documents/{doc.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"status": "indexed", "file_path": "/new.pdf"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "indexed"
    assert data["file_path"] == "/new.pdf"


def test_update_document_tag_ids_200(
    client: TestClient, tenant, admin_user, db_session: Session, tag_a, tag_b
):
    doc = Document(
        id=_id(),
        tenant_id=tenant.id,
        status="queued",
        file_path=None,
    )
    db_session.add(doc)
    db_session.flush()

    r = client.patch(
        f"/admin/documents/{doc.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"tag_ids": [str(tag_a.id), str(tag_b.id)]},
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["tag_ids"]) == 2

    r2 = client.patch(
        f"/admin/documents/{doc.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"tag_ids": [str(tag_a.id)]},
    )
    assert r2.status_code == 200
    assert len(r2.json()["tag_ids"]) == 1
    assert _uuid_eq(r2.json()["tag_ids"][0], tag_a.id)


def test_update_document_tag_ids_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session, tag_a
):
    doc = Document(
        id=_id(),
        tenant_id=tenant.id,
        status="queued",
        file_path=None,
    )
    db_session.add(doc)
    other_tag = Tag(
        id=_id(),
        tenant_id=other_tenant.id,
        name="other-tag",
    )
    db_session.add(other_tag)
    db_session.flush()

    r = client.patch(
        f"/admin/documents/{doc.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"tag_ids": [str(tag_a.id), str(other_tag.id)]},
    )
    assert r.status_code == 404


def test_update_document_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_doc = Document(
        id=_id(),
        tenant_id=other_tenant.id,
        status="queued",
        file_path="/other.pdf",
    )
    db_session.add(other_doc)
    db_session.flush()

    r = client.patch(
        f"/admin/documents/{other_doc.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
        json={"status": "indexed"},
    )
    assert r.status_code == 404


# ----- Delete -----


def test_delete_document_204(
    client: TestClient, tenant, admin_user, db_session: Session
):
    doc = Document(
        id=_id(),
        tenant_id=tenant.id,
        status="queued",
        file_path="/del.pdf",
    )
    db_session.add(doc)
    db_session.flush()
    doc_id = doc.id

    r = client.delete(
        f"/admin/documents/{doc_id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 204

    r2 = client.get(
        f"/admin/documents/{doc_id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r2.status_code == 404


def test_delete_document_other_tenant_404(
    client: TestClient, tenant, other_tenant, admin_user, db_session: Session
):
    other_doc = Document(
        id=_id(),
        tenant_id=other_tenant.id,
        status="queued",
        file_path="/other.pdf",
    )
    db_session.add(other_doc)
    db_session.flush()

    r = client.delete(
        f"/admin/documents/{other_doc.id}",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 404
