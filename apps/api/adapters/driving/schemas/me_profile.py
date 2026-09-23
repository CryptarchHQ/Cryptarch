"""Request/response schemas for GET /me (session profile)."""

from core.application.session_profile import SessionProfile
from pydantic import BaseModel


class MeProfileResponse(BaseModel):
    email: str
    tenant_name: str | None
    role: str
    sub: str


def profile_to_response(profile: SessionProfile) -> MeProfileResponse:
    return MeProfileResponse(
        email=profile.email,
        tenant_name=profile.tenant_name,
        role=profile.role,
        sub=profile.sub,
    )
