"""User repository implementation. Implements core.ports.user_repository.UserRepository."""

from core.domain.models import User
from core.ports.user_repository import UserRepository
from sqlalchemy.orm import Session

from adapters.driven.persistence.models import UserOrm, UserTagOrm
from adapters.driven.persistence.uuid_utils import normalize_uuid, parse_uuid, to_hex


def _orm_to_domain(orm: UserOrm) -> User:
    return User(
        id=str(orm.id),
        tenant_id=str(orm.tenant_id),
        email=orm.email,
        role=orm.role,
        password_hash=orm.password_hash,
    )


class UserRepositoryImpl(UserRepository):
    """Implements UserRepository using SQLAlchemy Session and UserOrm."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def list_by_tenant(self, tenant_id: str) -> list[User]:
        tid_norm = normalize_uuid(tenant_id)
        tid_parsed = parse_uuid(tenant_id)
        hex_str = tid_parsed.hex if tid_parsed else tenant_id
        rows = (
            self._session.query(UserOrm)
            .filter(UserOrm.tenant_id.in_([tid_norm, hex_str]))
            .all()
        )
        return [_orm_to_domain(r) for r in rows]

    def get_by_id(self, user_id: str, tenant_id: str) -> User | None:
        uid = parse_uuid(user_id)
        if uid is None:
            return None
        uid_hex = uid.hex
        uid_canonical = str(uid)
        orm = (
            self._session.query(UserOrm)
            .filter(UserOrm.id.in_([uid_hex, uid_canonical]))
            .first()
        )
        if not orm:
            return None
        user_tid = normalize_uuid(str(orm.tenant_id))
        expected_tid = normalize_uuid(tenant_id)
        if user_tid != expected_tid:
            return None
        return _orm_to_domain(orm)

    def get_by_email(self, tenant_id: str, email: str) -> User | None:
        tid_norm = normalize_uuid(tenant_id)
        tid_parsed = parse_uuid(tenant_id)
        hex_str = tid_parsed.hex if tid_parsed else tenant_id
        orm = (
            self._session.query(UserOrm)
            .filter(UserOrm.tenant_id.in_([tid_norm, hex_str]), UserOrm.email == email)
            .first()
        )
        return _orm_to_domain(orm) if orm else None

    def get_user_tag_ids(self, user_id: str) -> list[str]:
        """Return tag_ids for the user as canonical UUID strings."""
        uid = parse_uuid(user_id)
        if uid is None:
            return []
        u_hex, u_canonical = uid.hex, str(uid)
        rows = (
            self._session.query(UserTagOrm.tag_id)
            .filter(UserTagOrm.user_id.in_([u_hex, u_canonical]))
            .all()
        )
        result = []
        for (tag_id,) in rows:
            u = parse_uuid(tag_id) if tag_id else None
            result.append(str(u) if u else str(tag_id))
        return result

    def add(self, user: User, tag_ids: list[str] | None = None) -> User:
        orm = UserOrm(
            tenant_id=user.tenant_id,
            email=user.email,
            role=user.role,
            password_hash=user.password_hash,
        )
        self._session.add(orm)
        self._session.flush()
        if tag_ids:
            for tag_id in tag_ids:
                self._session.add(
                    UserTagOrm(
                        user_id=orm.id,
                        tag_id=to_hex(tag_id),
                    )
                )
            self._session.flush()
        self._session.refresh(orm)
        return _orm_to_domain(orm)

    def save(self, user: User, tag_ids: list[str] | None = None) -> User:
        uid = parse_uuid(user.id)
        if uid is None:
            return user
        uid_hex = uid.hex
        uid_canonical = str(uid)
        orm = (
            self._session.query(UserOrm)
            .filter(UserOrm.id.in_([uid_hex, uid_canonical]))
            .first()
        )
        if not orm:
            return user
        if tag_ids is not None:
            self._session.query(UserTagOrm).filter(
                UserTagOrm.user_id == orm.id
            ).delete()
            for tag_id in tag_ids:
                self._session.add(
                    UserTagOrm(
                        user_id=orm.id,
                        tag_id=to_hex(tag_id),
                    )
                )
        orm.email = user.email
        orm.role = user.role
        orm.password_hash = user.password_hash
        self._session.flush()
        self._session.refresh(orm)
        return _orm_to_domain(orm)

    def delete(self, user: User) -> None:
        uid = parse_uuid(user.id)
        if uid is None:
            return
        uid_hex = uid.hex
        uid_canonical = str(uid)
        orm = (
            self._session.query(UserOrm)
            .filter(UserOrm.id.in_([uid_hex, uid_canonical]))
            .first()
        )
        if orm is not None:
            self._session.query(UserTagOrm).filter(
                UserTagOrm.user_id == orm.id
            ).delete()
            self._session.delete(orm)
