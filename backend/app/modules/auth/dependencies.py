from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.enums import RecordStatus
from app.db.session import get_db_session
from app.modules.auth.security import TokenError, decode_access_token
from app.modules.users.models import User

bearer_scheme = HTTPBearer(auto_error=False)
SessionDependency = Annotated[AsyncSession, Depends(get_db_session)]


def unauthorized_exception(detail: str = "无法验证认证凭据") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: SessionDependency,
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized_exception()

    try:
        claims = decode_access_token(credentials.credentials)
        user_id = int(claims.sub)
        if user_id <= 0:
            raise ValueError
    except (TokenError, ValueError):
        raise unauthorized_exception() from None

    query = select(User).where(User.id == user_id).options(selectinload(User.roles))
    user = await session.scalar(query)
    if user is None or user.status != RecordStatus.ACTIVE:
        raise unauthorized_exception()

    return user


CurrentUserDependency = Annotated[User, Depends(get_current_user)]
