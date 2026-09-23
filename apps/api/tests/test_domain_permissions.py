"""
Domain tests: tag AND semantics, permission union, tenant isolation.
Require PostgreSQL (DATABASE_URL or DATABASE_URL_TEST).
"""

import uuid

import pytest
from domain.models import (
    Action,
    ActionTag,
    Connector,
    Document,
    DocumentTag,
    Group,
    GroupActionFilter,
    GroupDocumentFilter,
    GroupUserFilter,
    SavedFilter,
    SavedFilterTag,
    Tag,
    Tenant,
    User,
    UserTag,
)
from sqlalchemy.orm import Session


def _id():
    return uuid.uuid4().hex


@pytest.fixture
def tenant(db_session: Session):
    t = Tenant(id=_id(), name="Acme")
    db_session.add(t)
    db_session.flush()
    return t


@pytest.fixture
def tags(tenant, db_session: Session):
    t1 = Tag(id=_id(), tenant_id=tenant.id, name="support")
    t2 = Tag(id=_id(), tenant_id=tenant.id, name="vip")
    db_session.add_all([t1, t2])
    db_session.flush()
    return [t1, t2]


def test_entity_matches_filter_tag_and_semantics(db_session: Session, tenant, tags):
    """SavedFilter with tags A and B matches entity that has BOTH A and B; not if only one."""
    from domain.permission_service import entity_has_all_filter_tags

    tag_a, tag_b = tags
    user = User(id=_id(), tenant_id=tenant.id, email="u@acme.com", role="user")
    db_session.add(user)
    db_session.flush()
    db_session.add(UserTag(user_id=user.id, tag_id=tag_a.id))
    db_session.add(UserTag(user_id=user.id, tag_id=tag_b.id))
    db_session.flush()

    filter_ab = SavedFilter(
        id=_id(), tenant_id=tenant.id, target_type="user", name="A and B"
    )
    db_session.add(filter_ab)
    db_session.add(SavedFilterTag(saved_filter_id=filter_ab.id, tag_id=tag_a.id))
    db_session.add(SavedFilterTag(saved_filter_id=filter_ab.id, tag_id=tag_b.id))
    db_session.flush()

    assert entity_has_all_filter_tags(db_session, "user", user.id, filter_ab.id) is True

    user_only_a = User(id=_id(), tenant_id=tenant.id, email="u2@acme.com", role="user")
    db_session.add(user_only_a)
    db_session.add(UserTag(user_id=user_only_a.id, tag_id=tag_a.id))
    db_session.flush()
    assert (
        entity_has_all_filter_tags(db_session, "user", user_only_a.id, filter_ab.id)
        is False
    )


def test_effective_actions_union(db_session: Session, tenant, tags):
    """User matching two groups gets union of actions from both groups' action filters."""
    from domain.permission_service import resolve_effective_action_ids

    tag_a, tag_b = tags
    user = User(id=_id(), tenant_id=tenant.id, email="u@acme.com", role="user")
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

    action1 = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=conn.id,
        method="GET",
        path="/a",
        name="A",
    )
    action2 = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=conn.id,
        method="GET",
        path="/b",
        name="B",
    )
    db_session.add_all([action1, action2])
    db_session.add(ActionTag(action_id=action1.id, tag_id=tag_a.id))
    db_session.add(ActionTag(action_id=action2.id, tag_id=tag_b.id))
    db_session.flush()

    f_user = SavedFilter(
        id=_id(), tenant_id=tenant.id, target_type="user", name="user A"
    )
    db_session.add(f_user)
    db_session.add(SavedFilterTag(saved_filter_id=f_user.id, tag_id=tag_a.id))
    f_act1 = SavedFilter(
        id=_id(), tenant_id=tenant.id, target_type="action", name="action A"
    )
    db_session.add(f_act1)
    db_session.add(SavedFilterTag(saved_filter_id=f_act1.id, tag_id=tag_a.id))
    f_act2 = SavedFilter(
        id=_id(), tenant_id=tenant.id, target_type="action", name="action B"
    )
    db_session.add(f_act2)
    db_session.add(SavedFilterTag(saved_filter_id=f_act2.id, tag_id=tag_b.id))
    db_session.flush()

    g1 = Group(id=_id(), tenant_id=tenant.id, name="G1")
    g2 = Group(id=_id(), tenant_id=tenant.id, name="G2")
    db_session.add_all([g1, g2])
    db_session.flush()

    db_session.add(GroupUserFilter(group_id=g1.id, saved_filter_id=f_user.id))
    db_session.add(GroupActionFilter(group_id=g1.id, saved_filter_id=f_act1.id))
    db_session.add(GroupUserFilter(group_id=g2.id, saved_filter_id=f_user.id))
    db_session.add(GroupActionFilter(group_id=g2.id, saved_filter_id=f_act2.id))
    db_session.flush()

    result = resolve_effective_action_ids(db_session, tenant.id, user.id)
    assert result == {action1.id, action2.id}


def test_tenant_isolation(db_session: Session, tenant, tags):
    """Resolving permissions for a user returns only actions/documents from that user's tenant."""
    from domain.permission_service import (
        resolve_effective_action_ids,
        resolve_effective_document_ids,
    )

    tenant2 = Tenant(id=_id(), name="Other")
    db_session.add(tenant2)
    db_session.flush()

    tag_t1 = tags[0]
    tag_t2 = Tag(id=_id(), tenant_id=tenant2.id, name="other-tag")
    db_session.add(tag_t2)
    db_session.flush()

    user1 = User(id=_id(), tenant_id=tenant.id, email="u1@acme.com", role="user")
    user2 = User(id=_id(), tenant_id=tenant2.id, email="u2@other.com", role="user")
    db_session.add_all([user1, user2])
    db_session.add(UserTag(user_id=user1.id, tag_id=tag_t1.id))
    db_session.add(UserTag(user_id=user2.id, tag_id=tag_t2.id))
    db_session.flush()

    conn1 = Connector(
        id=_id(), tenant_id=tenant.id, name="Test connector", base_url="https://a.com"
    )
    conn2 = Connector(
        id=_id(), tenant_id=tenant2.id, name="Test connector", base_url="https://b.com"
    )
    db_session.add_all([conn1, conn2])
    db_session.flush()

    action_t1 = Action(
        id=_id(),
        tenant_id=tenant.id,
        connector_id=conn1.id,
        method="GET",
        path="/",
        name="A1",
    )
    action_t2 = Action(
        id=_id(),
        tenant_id=tenant2.id,
        connector_id=conn2.id,
        method="GET",
        path="/",
        name="A2",
    )
    db_session.add_all([action_t1, action_t2])
    db_session.add(ActionTag(action_id=action_t1.id, tag_id=tag_t1.id))
    db_session.add(ActionTag(action_id=action_t2.id, tag_id=tag_t2.id))
    db_session.flush()

    f_user_t1 = SavedFilter(
        id=_id(), tenant_id=tenant.id, target_type="user", name="u1"
    )
    db_session.add(f_user_t1)
    db_session.add(SavedFilterTag(saved_filter_id=f_user_t1.id, tag_id=tag_t1.id))
    f_act_t1 = SavedFilter(
        id=_id(), tenant_id=tenant.id, target_type="action", name="a1"
    )
    db_session.add(f_act_t1)
    db_session.add(SavedFilterTag(saved_filter_id=f_act_t1.id, tag_id=tag_t1.id))
    f_user_t2 = SavedFilter(
        id=_id(), tenant_id=tenant2.id, target_type="user", name="u2"
    )
    db_session.add(f_user_t2)
    db_session.add(SavedFilterTag(saved_filter_id=f_user_t2.id, tag_id=tag_t2.id))
    f_act_t2 = SavedFilter(
        id=_id(), tenant_id=tenant2.id, target_type="action", name="a2"
    )
    db_session.add(f_act_t2)
    db_session.add(SavedFilterTag(saved_filter_id=f_act_t2.id, tag_id=tag_t2.id))
    db_session.flush()

    g1 = Group(id=_id(), tenant_id=tenant.id, name="G1")
    g2 = Group(id=_id(), tenant_id=tenant2.id, name="G2")
    db_session.add_all([g1, g2])
    db_session.flush()

    db_session.add(GroupUserFilter(group_id=g1.id, saved_filter_id=f_user_t1.id))
    db_session.add(GroupActionFilter(group_id=g1.id, saved_filter_id=f_act_t1.id))
    db_session.add(GroupUserFilter(group_id=g2.id, saved_filter_id=f_user_t2.id))
    db_session.add(GroupActionFilter(group_id=g2.id, saved_filter_id=f_act_t2.id))
    db_session.flush()

    actions_user1 = resolve_effective_action_ids(db_session, tenant.id, user1.id)
    actions_user2 = resolve_effective_action_ids(db_session, tenant2.id, user2.id)
    assert actions_user1 == {action_t1.id}
    assert actions_user2 == {action_t2.id}
    assert action_t2.id not in actions_user1
    assert action_t1.id not in actions_user2

    doc1 = Document(id=_id(), tenant_id=tenant.id, status="indexed", file_path="/d1")
    doc2 = Document(id=_id(), tenant_id=tenant2.id, status="indexed", file_path="/d2")
    db_session.add_all([doc1, doc2])
    db_session.add(DocumentTag(document_id=doc1.id, tag_id=tag_t1.id))
    db_session.add(DocumentTag(document_id=doc2.id, tag_id=tag_t2.id))
    db_session.flush()
    f_doc_t1 = SavedFilter(
        id=_id(), tenant_id=tenant.id, target_type="document", name="d1"
    )
    db_session.add(f_doc_t1)
    db_session.add(SavedFilterTag(saved_filter_id=f_doc_t1.id, tag_id=tag_t1.id))
    db_session.flush()
    db_session.add(GroupDocumentFilter(group_id=g1.id, saved_filter_id=f_doc_t1.id))
    db_session.flush()

    docs_user1 = resolve_effective_document_ids(db_session, tenant.id, user1.id)
    assert docs_user1 == {doc1.id}
    assert doc2.id not in docs_user1
