from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.db.enums import RecordStatus
from app.modules.auth.dependencies import CurrentUserDependency
from app.modules.users.models import User


def effective_role_codes(user: User) -> frozenset[str]:
    """Return active role codes already loaded for an authenticated user."""
    return frozenset(role.code for role in user.roles if role.status == RecordStatus.ACTIVE)


class RoleRequirement:
    def __init__(self, *allowed_role_codes: str) -> None:
        normalized_codes = frozenset(code.strip() for code in allowed_role_codes)
        if not normalized_codes or "" in normalized_codes:
            raise ValueError("at least one non-empty role code is required")
        self.allowed_role_codes = normalized_codes

    async def __call__(self, current_user: CurrentUserDependency) -> User:
        if effective_role_codes(current_user).isdisjoint(self.allowed_role_codes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="权限不足",
            )
        return current_user


def require_roles(*allowed_role_codes: str) -> RoleRequirement:
    """Build a FastAPI dependency that accepts any listed active role code."""
    return RoleRequirement(*allowed_role_codes)


AdminOnly = Annotated[User, Depends(require_roles("admin"))]
TeacherOrAdmin = Annotated[User, Depends(require_roles("admin", "teacher"))]
StudentOnly = Annotated[User, Depends(require_roles("student"))]
