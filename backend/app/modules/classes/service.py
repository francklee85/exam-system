from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.exceptions import ResourceConflictError, ResourceNotFoundError
from app.db.enums import RecordStatus
from app.modules.classes.models import Class
from app.modules.classes.schemas import ClassCreate, ClassUpdate
from app.modules.majors.models import Major


async def _get_active_major(session: AsyncSession, major_id: int) -> Major:
    major = await session.scalar(select(Major).where(Major.id == major_id))
    if major is None:
        raise ResourceNotFoundError("专业不存在")
    if major.status != RecordStatus.ACTIVE:
        raise ResourceConflictError("所属专业已禁用，不能创建或调整班级")
    return major


async def _ensure_code_unique(
    session: AsyncSession,
    code: str,
    *,
    exclude_id: int | None = None,
) -> None:
    query = select(Class).where(Class.code == code)
    if exclude_id is not None:
        query = query.where(Class.id != exclude_id)
    if await session.scalar(query) is not None:
        raise ResourceConflictError("班级编码已存在")


async def _commit(session: AsyncSession) -> None:
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ResourceConflictError("班级编码已存在") from None


async def create_class(session: AsyncSession, payload: ClassCreate) -> Class:
    major = await _get_active_major(session, payload.major_id)
    await _ensure_code_unique(session, payload.code)
    class_record = Class(
        major=major,
        name=payload.name,
        code=payload.code,
        enrollment_year=payload.enrollment_year,
        description=payload.description,
        status=RecordStatus.ACTIVE,
    )
    session.add(class_record)
    await _commit(session)
    return class_record


async def list_classes(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    keyword: str | None = None,
    major_id: int | None = None,
    record_status: RecordStatus | None = None,
    enrollment_year: int | None = None,
) -> tuple[list[Class], int]:
    filters = []
    normalized_keyword = keyword.strip() if keyword is not None else ""
    if normalized_keyword:
        filters.append(
            or_(
                Class.name.contains(normalized_keyword, autoescape=True),
                Class.code.contains(normalized_keyword, autoescape=True),
            )
        )
    if major_id is not None:
        filters.append(Class.major_id == major_id)
    if record_status is not None:
        filters.append(Class.status == record_status)
    if enrollment_year is not None:
        filters.append(Class.enrollment_year == enrollment_year)

    total = await session.scalar(select(func.count(Class.id)).where(*filters))
    query = (
        select(Class)
        .where(*filters)
        .options(joinedload(Class.major))
        .order_by(Class.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await session.scalars(query)
    return list(result), int(total or 0)


async def get_class(session: AsyncSession, class_id: int) -> Class:
    query = select(Class).where(Class.id == class_id).options(joinedload(Class.major))
    class_record = await session.scalar(query)
    if class_record is None:
        raise ResourceNotFoundError("班级不存在")
    return class_record


async def update_class(
    session: AsyncSession,
    class_id: int,
    payload: ClassUpdate,
) -> Class:
    class_record = await get_class(session, class_id)
    await _ensure_code_unique(session, payload.code, exclude_id=class_record.id)
    if payload.major_id != class_record.major_id:
        class_record.major = await _get_active_major(session, payload.major_id)

    class_record.name = payload.name
    class_record.code = payload.code
    class_record.enrollment_year = payload.enrollment_year
    class_record.description = payload.description
    await _commit(session)
    return class_record


async def update_class_status(
    session: AsyncSession,
    class_id: int,
    record_status: RecordStatus,
) -> Class:
    class_record = await get_class(session, class_id)
    class_record.status = record_status
    await _commit(session)
    return class_record
