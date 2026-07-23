from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.elements import ColumnElement

from app.core.exceptions import ResourceNotFoundError
from app.db.enums import RecordStatus
from app.modules.auth.security import hash_password
from app.modules.roles.models import Role, UserRole
from app.modules.teachers.schemas import TeacherCreate, TeacherUpdate
from app.modules.users import service as user_service
from app.modules.users.models import User

TEACHER_ROLE_CODE = "teacher"


def _is_teacher() -> ColumnElement[bool]:
    return User.roles.any(Role.code == TEACHER_ROLE_CODE)


async def create_teacher(session: AsyncSession, payload: TeacherCreate) -> User:
    await user_service.ensure_username_unique(session, payload.username)
    teacher_role = await user_service.get_required_active_role(session, TEACHER_ROLE_CODE)
    teacher = User(
        username=payload.username,
        password_hash=hash_password(payload.password.get_secret_value()),
        real_name=payload.real_name,
        status=RecordStatus.ACTIVE,
    )
    teacher.role_assignments.append(UserRole(role=teacher_role))
    session.add(teacher)
    await user_service.commit_transaction(session, conflict_detail="用户名已存在")
    return await get_teacher(session, teacher.id)


async def list_teachers(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    keyword: str | None = None,
    record_status: RecordStatus | None = None,
) -> tuple[list[User], int]:
    filters = [_is_teacher()]
    normalized_keyword = keyword.strip() if keyword is not None else ""
    if normalized_keyword:
        filters.append(
            or_(
                User.username.contains(normalized_keyword, autoescape=True),
                User.real_name.contains(normalized_keyword, autoescape=True),
            )
        )
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


async def get_teacher(session: AsyncSession, user_id: int) -> User:
    query = (
        select(User)
        .where(User.id == user_id, _is_teacher())
        .options(selectinload(User.roles))
        .execution_options(populate_existing=True)
    )
    teacher = await session.scalar(query)
    if teacher is None:
        raise ResourceNotFoundError("教师不存在")
    return teacher


async def update_teacher(
    session: AsyncSession,
    user_id: int,
    payload: TeacherUpdate,
) -> User:
    teacher = await get_teacher(session, user_id)
    await user_service.ensure_username_unique(
        session,
        payload.username,
        exclude_id=teacher.id,
    )
    teacher.username = payload.username
    teacher.real_name = payload.real_name
    await user_service.commit_transaction(session, conflict_detail="用户名已存在")
    return teacher


async def update_teacher_status(
    session: AsyncSession,
    user_id: int,
    record_status: RecordStatus,
) -> User:
    teacher = await get_teacher(session, user_id)
    teacher.status = record_status
    await user_service.commit_transaction(session, conflict_detail="教师状态更新失败")
    return teacher
