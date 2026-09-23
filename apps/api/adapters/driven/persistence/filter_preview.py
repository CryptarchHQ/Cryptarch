"""
Filter preview: count/sample entities matching tag AND semantics (no persistence).
Reuses the same AND rule as permission matching: entity must have every requested tag.
"""

from dataclasses import dataclass

from core.ports.filter_preview import (
    FilterPreviewPort,
    FilterPreviewResult,
    FilterPreviewSampleItem,
)
from shared_contract import (
    SAVED_FILTER_TARGET_ACTION,
    SAVED_FILTER_TARGET_DOCUMENT,
    SAVED_FILTER_TARGET_USER,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from adapters.driven.persistence.models import (
    ActionOrm,
    ActionTagOrm,
    DocumentOrm,
    DocumentTagOrm,
    UserOrm,
    UserTagOrm,
)
from adapters.driven.persistence.uuid_utils import normalize_uuid, parse_uuid, to_hex

SAMPLE_LIMIT_DEFAULT = 5


def _tenant_id_variants(tenant_id: str) -> list[str]:
    tid = parse_uuid(tenant_id)
    if tid is None:
        return [tenant_id]
    return [tid.hex, str(tid)]


def _normalize_tag_id_set(tag_ids: list[str]) -> set[str]:
    """Normalize to hex for comparison with DB-stored tag ids."""
    return {to_hex(t) for t in tag_ids}


def _entity_has_all_tags(entity_tag_ids: set[str], required_hex: set[str]) -> bool:
    """AND semantics: required tags must be a subset of entity tags. Empty required => True."""
    if not required_hex:
        return True
    entity_hex = {to_hex(str(t)) for t in entity_tag_ids}
    return required_hex <= entity_hex


def _canonical_id(value: str) -> str:
    return normalize_uuid(str(value)) or str(value)


@dataclass
class _EntityRow:
    id: str
    label: str
    tag_ids: set[str]


class FilterPreviewImpl(FilterPreviewPort):
    def __init__(self, session: Session) -> None:
        self._session = session

    def preview(
        self,
        tenant_id: str,
        target_type: str,
        tag_ids: list[str],
        *,
        sample_limit: int = SAMPLE_LIMIT_DEFAULT,
    ) -> FilterPreviewResult:
        required = _normalize_tag_id_set(tag_ids)
        rows = self._load_entities(tenant_id, target_type)
        matched = [r for r in rows if _entity_has_all_tags(r.tag_ids, required)]
        sample = [
            FilterPreviewSampleItem(id=_canonical_id(r.id), label=r.label)
            for r in matched[:sample_limit]
        ]
        return FilterPreviewResult(count=len(matched), sample=sample)

    def _load_entities(self, tenant_id: str, target_type: str) -> list[_EntityRow]:
        variants = _tenant_id_variants(tenant_id)
        if target_type == SAVED_FILTER_TARGET_USER:
            return self._load_users(variants)
        if target_type == SAVED_FILTER_TARGET_ACTION:
            return self._load_actions(variants)
        if target_type == SAVED_FILTER_TARGET_DOCUMENT:
            return self._load_documents(variants)
        raise ValueError(f"Unknown target_type: {target_type}")

    def _load_users(self, tenant_variants: list[str]) -> list[_EntityRow]:
        users = (
            self._session.execute(
                select(UserOrm).where(UserOrm.tenant_id.in_(tenant_variants))
            )
            .scalars()
            .all()
        )
        tags_by_user: dict[str, set[str]] = {str(u.id): set() for u in users}
        if users:
            user_ids = [u.id for u in users]
            for uid, tid in self._session.execute(
                select(UserTagOrm.user_id, UserTagOrm.tag_id).where(
                    UserTagOrm.user_id.in_(user_ids)
                )
            ).all():
                key = str(uid)
                if key in tags_by_user:
                    tags_by_user[key].add(str(tid))
        return [
            _EntityRow(
                id=str(u.id), label=u.email or "", tag_ids=tags_by_user[str(u.id)]
            )
            for u in users
        ]

    def _load_actions(self, tenant_variants: list[str]) -> list[_EntityRow]:
        actions = (
            self._session.execute(
                select(ActionOrm).where(ActionOrm.tenant_id.in_(tenant_variants))
            )
            .scalars()
            .all()
        )
        tags_by_action: dict[str, set[str]] = {str(a.id): set() for a in actions}
        if actions:
            action_ids = [a.id for a in actions]
            for aid, tid in self._session.execute(
                select(ActionTagOrm.action_id, ActionTagOrm.tag_id).where(
                    ActionTagOrm.action_id.in_(action_ids)
                )
            ).all():
                key = str(aid)
                if key in tags_by_action:
                    tags_by_action[key].add(str(tid))
        return [
            _EntityRow(
                id=str(a.id),
                label=a.name or "",
                tag_ids=tags_by_action[str(a.id)],
            )
            for a in actions
        ]

    def _load_documents(self, tenant_variants: list[str]) -> list[_EntityRow]:
        docs = (
            self._session.execute(
                select(DocumentOrm).where(DocumentOrm.tenant_id.in_(tenant_variants))
            )
            .scalars()
            .all()
        )
        tags_by_doc: dict[str, set[str]] = {str(d.id): set() for d in docs}
        if docs:
            doc_ids = [d.id for d in docs]
            for did, tid in self._session.execute(
                select(DocumentTagOrm.document_id, DocumentTagOrm.tag_id).where(
                    DocumentTagOrm.document_id.in_(doc_ids)
                )
            ).all():
                key = str(did)
                if key in tags_by_doc:
                    tags_by_doc[key].add(str(tid))
        result = []
        for d in docs:
            eid = str(d.id)
            label = d.file_path if d.file_path else _canonical_id(eid)
            result.append(_EntityRow(id=eid, label=label, tag_ids=tags_by_doc[eid]))
        return result
