"""Admin HTTP routes for Connectors. Uses core.application.connector and SqlAlchemyConnectorRepository."""

from typing import Annotated

from core.application import connector as connector_use_cases
from core.application import connector_test as connector_test_use_cases
from core.application.connector import ConnectorHasActionsError
from dependencies import CurrentUser, get_db, require_admin
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from adapters.driven.persistence.connector_repository import (
    SqlAlchemyConnectorRepository,
)
from adapters.driving.schemas.connector import (
    ConnectorCreateBody,
    ConnectorTestResponse,
    ConnectorUpdateBody,
    connector_to_response,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/connectors")
def list_connectors(
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """List connectors of the current tenant."""
    repo = SqlAlchemyConnectorRepository(db)
    connectors = connector_use_cases.list_connectors(current_user.tenant_id, repo)
    return [connector_to_response(c) for c in connectors]


@router.get("/connectors/{connector_id}")
def get_connector(
    connector_id: str,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Get connector by id; 404 if not in current tenant."""
    repo = SqlAlchemyConnectorRepository(db)
    conn = connector_use_cases.get_connector(connector_id, current_user.tenant_id, repo)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found"
        )
    return connector_to_response(conn)


@router.post("/connectors", status_code=status.HTTP_201_CREATED)
def create_connector(
    body: ConnectorCreateBody,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Create connector in current tenant. tenant_id from JWT only."""
    repo = SqlAlchemyConnectorRepository(db)
    conn = connector_use_cases.create_connector(
        current_user.tenant_id,
        body.name,
        body.base_url,
        body.auth_config,
        repo,
        description=body.description,
    )
    db.commit()
    return connector_to_response(conn)


@router.patch("/connectors/{connector_id}")
def update_connector(
    connector_id: str,
    body: ConnectorUpdateBody,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Update connector; 404 if not in current tenant."""
    repo = SqlAlchemyConnectorRepository(db)
    conn = connector_use_cases.update_connector(
        connector_id,
        current_user.tenant_id,
        body.base_url,
        body.auth_config,
        repo,
        name=body.name,
        description=body.description,
    )
    if conn is None:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found"
        )
    db.commit()
    return connector_to_response(conn)


@router.delete("/connectors/{connector_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connector(
    connector_id: str,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Delete connector; 404 if not in current tenant. 409 if connector has actions."""
    repo = SqlAlchemyConnectorRepository(db)
    try:
        deleted = connector_use_cases.delete_connector(
            connector_id, current_user.tenant_id, repo
        )
    except ConnectorHasActionsError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Connector has associated actions",
        )
    if not deleted:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found"
        )
    db.commit()
    return None


@router.post("/connectors/{connector_id}/test", response_model=ConnectorTestResponse)
def test_connector(
    connector_id: str,
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Probe connector auth against base_url (or oauth2 token_url). Never returns secrets."""
    repo = SqlAlchemyConnectorRepository(db)
    result = connector_test_use_cases.test_connector_auth(
        connector_id, current_user.tenant_id, repo
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found"
        )
    return ConnectorTestResponse(ok=result.ok, detail=result.detail)
