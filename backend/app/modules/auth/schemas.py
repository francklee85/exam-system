from typing import Literal, Self

from pydantic import BaseModel, Field, SecretStr

from app.modules.users.models import User


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: SecretStr = Field(min_length=1, max_length=1024)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class CurrentUserResponse(BaseModel):
    id: int
    username: str
    real_name: str
    roles: list[str]

    @classmethod
    def from_user(cls, user: User) -> Self:
        return cls(
            id=user.id,
            username=user.username,
            real_name=user.real_name,
            roles=sorted(role.code for role in user.roles),
        )
