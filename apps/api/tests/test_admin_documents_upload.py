"""
Admin document upload + retry (ingestion API).
- POST /admin/documents/upload: multipart, PDF/TXT/CSV only; queues job; status=queued.
- POST /admin/documents/{id}/retry: only from error → queued + re-enqueue; no new document.
- Queue is injectable (no real Redis in tests).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from auth.service import hash_password
from config import JWT_ALGORITHM, JWT_SECRET
from dependencies import get_db, get_document_job_queue, get_upload_dir
from domain.models import Document, Tenant, User
from fastapi.testclient import TestClient
from jose import jwt
from main import app
from sqlalchemy.orm import Session


class FakeDocumentJobQueue:
    """Test double: records enqueued jobs."""

    def __init__(self) -> None:
        self.jobs: list[dict] = []

    def enqueue(self, job: dict) -> None:
        self.jobs.append(dict(job))


def _id() -> str:
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


def _auth_headers(tenant_id: str, user_id: str, role: str = "admin") -> dict:
    return {"Authorization": f"Bearer {_make_token(tenant_id, user_id, role)}"}


@pytest.fixture
def tenant(db_session: Session):
    t = Tenant(id=_id(), name="Acme")
    db_session.add(t)
    db_session.flush()
    return t


@pytest.fixture
def admin_user(db_session: Session, tenant):
    u = User(
        id=_id(),
        tenant_id=tenant.id,
        email="admin-upload@acme.com",
        role="admin",
        password_hash=hash_password("secret"),
    )
    db_session.add(u)
    db_session.flush()
    return u


@pytest.fixture
def upload_dir(tmp_path: Path) -> Path:
    d = tmp_path / "uploads"
    d.mkdir()
    return d


@pytest.fixture
def fake_queue() -> FakeDocumentJobQueue:
    return FakeDocumentJobQueue()


@pytest.fixture
def client(db_session: Session, upload_dir: Path, fake_queue: FakeDocumentJobQueue):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_upload_dir] = lambda: str(upload_dir)
    app.dependency_overrides[get_document_job_queue] = lambda: fake_queue
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_upload_dir, None)
    app.dependency_overrides.pop(get_document_job_queue, None)


def test_upload_rejects_unsupported_extension_422_no_document(
    client: TestClient,
    tenant,
    admin_user,
    fake_queue: FakeDocumentJobQueue,
    db_session: Session,
):
    """Rejected extension returns 422 and does not create a document or enqueue."""
    r = client.post(
        "/admin/documents/upload",
        headers=_auth_headers(tenant.id, admin_user.id),
        files={"file": ("notes.docx", b"fake", "application/octet-stream")},
    )
    assert r.status_code == 422
    assert fake_queue.jobs == []
    assert (
        db_session.query(Document).filter(Document.tenant_id == tenant.id).count() == 0
    )


def test_upload_pdf_creates_queued_document_and_enqueues_job(
    client: TestClient,
    tenant,
    admin_user,
    fake_queue: FakeDocumentJobQueue,
    upload_dir: Path,
):
    """Accepted PDF is stored, document status=queued, job enqueued once."""
    content = b"%PDF-1.4 fake"
    r = client.post(
        "/admin/documents/upload",
        headers=_auth_headers(tenant.id, admin_user.id),
        files={"file": ("report.PDF", content, "application/pdf")},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "queued"
    assert data["file_path"]
    assert Path(data["file_path"]).exists()
    assert Path(data["file_path"]).read_bytes() == content
    assert str(upload_dir) in data["file_path"]

    assert len(fake_queue.jobs) == 1
    job = fake_queue.jobs[0]
    assert job["document_id"] == data["id"] or uuid.UUID(
        job["document_id"]
    ) == uuid.UUID(data["id"])
    assert uuid.UUID(str(job["tenant_id"])) == uuid.UUID(str(tenant.id))
    assert job["file_path"] == data["file_path"]


@pytest.mark.parametrize(
    "filename,mime",
    [
        ("notes.txt", "text/plain"),
        ("data.csv", "text/csv"),
    ],
)
def test_upload_accepts_txt_and_csv(
    client: TestClient,
    tenant,
    admin_user,
    fake_queue: FakeDocumentJobQueue,
    filename: str,
    mime: str,
):
    r = client.post(
        "/admin/documents/upload",
        headers=_auth_headers(tenant.id, admin_user.id),
        files={"file": (filename, b"hello,world", mime)},
    )
    assert r.status_code == 201
    assert r.json()["status"] == "queued"
    assert len(fake_queue.jobs) == 1


def test_retry_from_error_requeues_without_new_document(
    client: TestClient,
    tenant,
    admin_user,
    fake_queue: FakeDocumentJobQueue,
    db_session: Session,
    upload_dir: Path,
):
    """Retry on error: same document → queued + another job; document count unchanged."""
    file_path = str(upload_dir / "existing.txt")
    Path(file_path).write_text("body", encoding="utf-8")
    doc = Document(
        id=_id(),
        tenant_id=tenant.id,
        status="error",
        file_path=file_path,
    )
    db_session.add(doc)
    db_session.flush()
    before_count = (
        db_session.query(Document).filter(Document.tenant_id == tenant.id).count()
    )

    r = client.post(
        f"/admin/documents/{doc.id}/retry",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "queued"
    assert uuid.UUID(data["id"]) == uuid.UUID(doc.id)
    assert data["file_path"] == file_path

    after_count = (
        db_session.query(Document).filter(Document.tenant_id == tenant.id).count()
    )
    assert after_count == before_count
    assert len(fake_queue.jobs) == 1
    job = fake_queue.jobs[0]
    assert uuid.UUID(str(job["document_id"])) == uuid.UUID(doc.id)
    assert job["file_path"] == file_path


def test_retry_when_not_error_409(
    client: TestClient,
    tenant,
    admin_user,
    fake_queue: FakeDocumentJobQueue,
    db_session: Session,
):
    doc = Document(
        id=_id(),
        tenant_id=tenant.id,
        status="queued",
        file_path="/tmp/x.txt",
    )
    db_session.add(doc)
    db_session.flush()

    r = client.post(
        f"/admin/documents/{doc.id}/retry",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 409
    assert fake_queue.jobs == []


def test_retry_missing_document_404(
    client: TestClient,
    tenant,
    admin_user,
    fake_queue: FakeDocumentJobQueue,
):
    r = client.post(
        f"/admin/documents/{_id()}/retry",
        headers=_auth_headers(tenant.id, admin_user.id),
    )
    assert r.status_code == 404
    assert fake_queue.jobs == []
