"""FastAPI dependencies: get_db, auth, etc."""

from typing import Annotated

from adapters.driven.persistence.db import get_db
from config import JWT_ALGORITHM, JWT_SECRET, REDIS_URL, UPLOAD_DIR
from core.ports.document_job_queue import DocumentJobQueue
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from shared_contract import ROLE_ADMIN

# So Swagger UI shows "Authorize" and sends Bearer token on every request
_http_bearer = HTTPBearer(auto_error=False)

__all__ = [
    "CurrentUser",
    "get_current_user",
    "get_db",
    "get_document_job_queue",
    "get_upload_dir",
    "require_admin",
]


class CurrentUser(BaseModel):
    sub: str
    tenant_id: str
    role: str


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_http_bearer),
) -> CurrentUser:
    """Extract and validate JWT from Authorization: Bearer <token>. Raises 401 if missing or invalid."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        sub = payload.get("sub")
        tenant_id = payload.get("tenant_id")
        role = payload.get("role")
        if not sub or not tenant_id or not role:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )
        return CurrentUser(sub=sub, tenant_id=tenant_id, role=role)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def require_admin(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> CurrentUser:
    """Require role admin; raises 403 for non-admin."""
    if current_user.role != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return current_user


def get_upload_dir() -> str:
    """Directory where uploaded document files are stored (env UPLOAD_DIR)."""
    return UPLOAD_DIR


def get_document_job_queue() -> DocumentJobQueue:
    """Redis-backed document job queue (overridable in tests)."""
    from adapters.driven.queue.redis_document_job_queue import RedisDocumentJobQueue

    return RedisDocumentJobQueue(REDIS_URL)
