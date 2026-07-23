from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.sql.elements import ColumnElement

from app.core.exceptions import (
    ResourceConflictError,
    ResourceNotFoundError,
    SystemConfigurationError,
)
from app.db.enums import RecordStatus
from app.modules.auth.security import hash_password
from app.modules.classes.models import Class
from app.modules.roles.models import Role, UserRole
from app.modules.students.models import StudentProfile
from app.modules.students.schemas import StudentCreate, StudentUpdate
from app.modules.users import service as user_service
from app.modules.users.models import User

STUDENT_ROLE_CODE = "student"


def _is_student() -> ColumnElement[bool]:
    return User.roles.any(Role.code == STUDENT_ROLE_CODE)


async def _ensure_student_no_unique(
    session: AsyncSession,
    student_no: str,
    *,
    exclude_user_id: int | None = None,
) -> None:
    query = select(StudentProfile.user_id).where(StudentProfile.student_no == student_no)
    if exclude_user_id is not None:
        query = query.where(StudentProfile.user_id != exclude_user_id)
    if await session.scalar(query) is not None:
        raise ResourceConflictError("学号已存在")


async def _get_available_class(session: AsyncSession, class_id: int) -> Class:
    query = select(Class).where(Class.id == class_id).options(joinedload(Class.major))
    student_class = await session.scalar(query)
    if student_class is None:
        raise ResourceNotFoundError("班级不存在")
    if student_class.status != RecordStatus.ACTIVE:
        raise ResourceConflictError("班级已禁用，不能分配学生")
    if student_class.major is None:
        raise SystemConfigurationError("班级所属专业不存在")
    if student_class.major.status != RecordStatus.ACTIVE:
        raise ResourceConflictError("班级所属专业已禁用，不能分配学生")
    return student_class


async def create_student(session: AsyncSession, payload: StudentCreate) -> User:
    await user_service.ensure_username_unique(session, payload.username)
    await _ensure_student_no_unique(session, payload.student_no)
    student_role = await user_service.get_required_active_role(session, STUDENT_ROLE_CODE)
    student_class = await _get_available_class(session, payload.class_id)

    student = User(
        username=payload.username,
        password_hash=hash_password(payload.password.get_secret_value()),
        real_name=payload.real_name,
        status=RecordStatus.ACTIVE,
    )
    student.role_assignments.append(UserRole(role=student_role))
    student.student_profile = StudentProfile(
        student_no=payload.student_no,
        student_class=student_class,
    )
    session.add(student)
    await user_service.commit_transaction(
        session,
        conflict_detail="用户名或学号已存在",
    )
    return await get_student(session, student.id)


async def list_students(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    keyword: str | None = None,
    student_no: str | None = None,
    major_id: int | None = None,
    class_id: int | None = None,
    record_status: RecordStatus | None = None,
) -> tuple[list[User], int]:
    filters = [_is_student()]
    normalized_keyword = keyword.strip() if keyword is not None else ""
    normalized_student_no = student_no.strip() if student_no is not None else ""
    if normalized_keyword:
        filters.append(
            or_(
                User.username.contains(normalized_keyword, autoescape=True),
                User.real_name.contains(normalized_keyword, autoescape=True),
                StudentProfile.student_no.contains(normalized_keyword, autoescape=True),
            )
        )
    if normalized_student_no:
        filters.append(StudentProfile.student_no == normalized_student_no)
    if major_id is not None:
        filters.append(Class.major_id == major_id)
    if class_id is not None:
        filters.append(StudentProfile.class_id == class_id)
    if record_status is not None:
        filters.append(User.status == record_status)

    base_query = (
        select(User)
        .join(User.student_profile)
        .join(StudentProfile.student_class)
        .join(Class.major)
        .where(*filters)
    )
    total = await session.scalar(
        select(func.count()).select_from(base_query.order_by(None).subquery())
    )
    query = (
        base_query.options(
            selectinload(User.roles),
            joinedload(User.student_profile)
            .joinedload(StudentProfile.student_class)
            .joinedload(Class.major),
        )
        .order_by(User.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await session.scalars(query)
    return list(result), int(total or 0)


async def get_student(session: AsyncSession, user_id: int) -> User:
    query = (
        select(User)
        .join(User.student_profile)
        .where(User.id == user_id, _is_student())
        .options(
            selectinload(User.roles),
            joinedload(User.student_profile)
            .joinedload(StudentProfile.student_class)
            .joinedload(Class.major),
        )
        .execution_options(populate_existing=True)
    )
    student = await session.scalar(query)
    if student is None or student.student_profile is None:
        raise ResourceNotFoundError("学生不存在")
    return student


async def update_student(
    session: AsyncSession,
    user_id: int,
    payload: StudentUpdate,
) -> User:
    student = await get_student(session, user_id)
    profile = student.student_profile
    if profile is None:
        raise ResourceNotFoundError("学生不存在")
    await user_service.ensure_username_unique(
        session,
        payload.username,
        exclude_id=student.id,
    )
    await _ensure_student_no_unique(
        session,
        payload.student_no,
        exclude_user_id=student.id,
    )
    if payload.class_id != profile.class_id:
        profile.student_class = await _get_available_class(session, payload.class_id)

    student.username = payload.username
    student.real_name = payload.real_name
    profile.student_no = payload.student_no
    await user_service.commit_transaction(
        session,
        conflict_detail="用户名或学号已存在",
    )
    return await get_student(session, student.id)


async def update_student_status(
    session: AsyncSession,
    user_id: int,
    record_status: RecordStatus,
) -> User:
    student = await get_student(session, user_id)
    student.status = record_status
    await user_service.commit_transaction(session, conflict_detail="学生状态更新失败")
    return student
