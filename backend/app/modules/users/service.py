from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ResourceConflictError, SystemConfigurationError
from app.db.enums import RecordStatus
from app.modules.roles.models import Role
from app.modules.users.models import User


async def ensure_username_unique(
    session: AsyncSession,
    username: str,
    *,
    exclude_id: int | None = None,
) -> None:
    query = select(User.id).where(User.username == username)
    if exclude_id is not None:
        query = query.where(User.id != exclude_id)
    if await session.scalar(query) is not None:
        raise ResourceConflictError("用户名已存在")


async def get_required_active_role(session: AsyncSession, role_code: str) -> Role:
    role = await session.scalar(select(Role).where(Role.code == role_code))
    if role is None or role.status != RecordStatus.ACTIVE:
        raise SystemConfigurationError(f"基础角色 {role_code} 不存在或未启用")
    return role


async def commit_transaction(session: AsyncSession, *, conflict_detail: str) -> None:
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ResourceConflictError(conflict_detail) from None
    except SQLAlchemyError:
        await session.rollback()
        raise


async def list_users(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    keyword: str | None = None,
    role_code: str | None = None,
    record_status: RecordStatus | None = None,
) -> tuple[list[User], int]:
    filters = []
    normalized_keyword = keyword.strip() if keyword is not None else ""
    normalized_role_code = role_code.strip() if role_code is not None else ""
    if normalized_keyword:
        filters.append(
            or_(
                User.username.contains(normalized_keyword, autoescape=True),
                User.real_name.contains(normalized_keyword, autoescape=True),
            )
        )
    if normalized_role_code:
        filters.append(User.roles.any(Role.code == normalized_role_code))
    if record_status is not None:
        filters.append(User.status == record_status)

    total = await session.scalar(select(func.count(User.id)).where(*filters))
    query = (
        select(User)
        .where(*filters)
        .options(selectinload(User.roles))
        .order_by(User.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await session.scalars(query)
    return list(result), int(total or 0)
