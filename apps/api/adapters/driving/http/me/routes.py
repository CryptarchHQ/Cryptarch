"""Current-user routes: session profile and preferences."""

from typing import Annotated

from core.application import session_profile as profile_use_cases
from core.application import user_preferences as prefs_use_cases
from dependencies import CurrentUser, get_current_user, get_db
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from adapters.driven.persistence.tenant_repository import TenantRepositoryImpl
from adapters.driven.persistence.user_preferences_repository import (
    UserPreferencesRepositoryImpl,
)
from adapters.driven.persistence.user_repository import UserRepositoryImpl
from adapters.driving.schemas.me_profile import MeProfileResponse, profile_to_response
from adapters.driving.schemas.user_preferences import (
    UserPreferencesPatchBody,
    preferences_to_response,
)

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=MeProfileResponse)
def get_my_profile(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MeProfileResponse:
    """Session profile for any authenticated user: email, tenant_name, role, sub."""
    profile = profile_use_cases.get_session_profile(
        current_user.tenant_id,
        current_user.sub,
        current_user.role,
        user_repo=UserRepositoryImpl(db),
        tenant_repo=TenantRepositoryImpl(db),
    )
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return profile_to_response(profile)


@router.get("/preferences")
def get_my_preferences(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    repo = UserPreferencesRepositoryImpl(db)
    prefs = prefs_use_cases.get_preferences(
        current_user.tenant_id, current_user.sub, repo
    )
    return preferences_to_response(prefs)


@router.patch("/preferences")
def patch_my_preferences(
    body: UserPreferencesPatchBody,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    repo = UserPreferencesRepositoryImpl(db)
    prefs = prefs_use_cases.update_preferences(
        current_user.tenant_id,
        current_user.sub,
        theme=body.theme.value if body.theme is not None else None,
        language=body.language,
        table_density=body.table_density,
        metadata=body.metadata,
        repo=repo,
    )
    return preferences_to_response(prefs)
