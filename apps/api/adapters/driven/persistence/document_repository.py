"""Implements DocumentRepository port. Uses Session and ORM models (DocumentOrm, DocumentTagOrm)."""

from core.domain.models import Document
from core.ports.document_repository import DocumentRepository
from sqlalchemy import or_
from sqlalchemy.orm import Session

from adapters.driven.persistence.models import DocumentOrm, DocumentTagOrm
from adapters.driven.persistence.uuid_utils import normalize_uuid, parse_uuid, to_hex


def _orm_to_domain(orm: DocumentOrm) -> Document:
    return Document(
        id=str(orm.id),
        tenant_id=str(orm.tenant_id),
        status=orm.status,
        file_path=orm.file_path,
        original_filename=orm.original_filename,
        uploaded_at=orm.uploaded_at,
    )


class SqlAlchemyDocumentRepository(DocumentRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_by_tenant(self, tenant_id: str) -> list[Document]:
        tid_norm = normalize_uuid(tenant_id)
        tid_hex = parse_uuid(tenant_id)
        hex_str = tid_hex.hex if tid_hex else tenant_id
        rows = (
            self._session.query(DocumentOrm)
            .filter(
                or_(DocumentOrm.tenant_id == tid_norm, DocumentOrm.tenant_id == hex_str)
            )
            .all()
        )
        return [_orm_to_domain(r) for r in rows]

    def get_by_id(self, document_id: str, tenant_id: str) -> Document | None:
        did = parse_uuid(document_id)
        if did is None:
            return None
        d_hex, d_canonical = did.hex, str(did)
        orm = (
            self._session.query(DocumentOrm)
            .filter(or_(DocumentOrm.id == d_hex, DocumentOrm.id == d_canonical))
            .first()
        )
        if not orm or normalize_uuid(str(orm.tenant_id)) != normalize_uuid(tenant_id):
            return None
        return _orm_to_domain(orm)

    def get_document_tag_ids(self, document_id: str) -> list[str]:
        """Return tag_ids for the document as canonical UUID strings."""
        did = parse_uuid(document_id)
        if did is None:
            return []
        d_hex, d_canonical = did.hex, str(did)
        rows = (
            self._session.query(DocumentTagOrm.tag_id)
            .filter(
                or_(
                    DocumentTagOrm.document_id == d_hex,
                    DocumentTagOrm.document_id == d_canonical,
                )
            )
            .all()
        )
        result = []
        for (tag_id,) in rows:
            u = parse_uuid(tag_id) if tag_id else None
            result.append(str(u) if u else str(tag_id))
        return result

    def add(self, document: Document, tag_ids: list[str]) -> Document:
        orm = DocumentOrm(
            tenant_id=document.tenant_id,
            status=document.status,
            file_path=document.file_path,
            original_filename=document.original_filename,
            uploaded_at=document.uploaded_at,
        )
        self._session.add(orm)
        self._session.flush()
        for tag_id in tag_ids:
            self._session.add(
                DocumentTagOrm(
                    document_id=orm.id,
                    tag_id=to_hex(tag_id),
                )
            )
        self._session.flush()
        self._session.refresh(orm)
        return _orm_to_domain(orm)

    def save(
        self,
        document: Document,
        tag_ids: list[str] | None,
    ) -> Document:
        did = parse_uuid(document.id)
        if did is None:
            return document
        d_hex, d_canonical = did.hex, str(did)
        orm = (
            self._session.query(DocumentOrm)
            .filter(or_(DocumentOrm.id == d_hex, DocumentOrm.id == d_canonical))
            .first()
        )
        if not orm:
            return document
        if tag_ids is not None:
            self._session.query(DocumentTagOrm).filter(
                DocumentTagOrm.document_id == orm.id
            ).delete()
            for tag_id in tag_ids:
                self._session.add(
                    DocumentTagOrm(
                        document_id=orm.id,
                        tag_id=to_hex(tag_id),
                    )
                )
        if document.status is not None:
            orm.status = document.status
        if document.file_path is not None:
            orm.file_path = document.file_path
        self._session.flush()
        self._session.refresh(orm)
        return _orm_to_domain(orm)

    def delete(self, document: Document) -> None:
        did = parse_uuid(document.id)
        if did is None:
            return
        d_hex, d_canonical = did.hex, str(did)
        orm = (
            self._session.query(DocumentOrm)
            .filter(or_(DocumentOrm.id == d_hex, DocumentOrm.id == d_canonical))
            .first()
        )
        if orm is not None:
            self._session.query(DocumentTagOrm).filter(
                DocumentTagOrm.document_id == orm.id
            ).delete()
            self._session.delete(orm)
