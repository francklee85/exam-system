from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.enums import RecordStatus
from app.modules.auth.security import verify_password, verify_password_for_missing_user
from app.modules.users.models import User


async def authenticate_user(
    session: AsyncSession,
    *,
    username: str,
    password: str,
) -> User | None:
    query = select(User).where(User.username == username).options(selectinload(User.roles))
    user = await session.scalar(query)

    if user is None:
        verify_password_for_missing_user(password)
        return None

    password_is_valid = verify_password(password, user.password_hash)
    if not password_is_valid or user.status != RecordStatus.ACTIVE:
        return None

    return user
