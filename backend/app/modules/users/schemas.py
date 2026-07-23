from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from app.db.enums import RecordStatus
from app.modules.users.models import User


class UserIdentityInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=50)
    real_name: str = Field(min_length=1, max_length=50)

    @field_validator("username", "real_name", mode="before")
    @classmethod
    def strip_required_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class UserCreateInput(UserIdentityInput):
    password: SecretStr = Field(min_length=8, max_length=1024)


class UserResponse(BaseModel):
    id: int
    username: str
    real_name: str
    status: RecordStatus
    roles: list[str]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_user(cls, user: User) -> Self:
        return cls(
            id=user.id,
            username=user.username,
            real_name=user.real_name,
            status=user.status,
            roles=sorted(role.code for role in user.roles),
            created_at=user.created_at,
            updated_at=user.updated_at,
        )
