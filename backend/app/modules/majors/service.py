from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceConflictError, ResourceNotFoundError
from app.db.enums import RecordStatus
from app.modules.majors.models import Major
from app.modules.majors.schemas import MajorCreate, MajorUpdate


async def _ensure_unique(
    session: AsyncSession,
    *,
    name: str,
    code: str,
    exclude_id: int | None = None,
) -> None:
    query = select(Major).where(or_(Major.name == name, Major.code == code))
    if exclude_id is not None:
        query = query.where(Major.id != exclude_id)

    matches = await session.scalars(query)
    for major in matches:
        if major.name == name:
            raise ResourceConflictError("专业名称已存在")
        if major.code == code:
            raise ResourceConflictError("专业编码已存在")


async def _commit(session: AsyncSession) -> None:
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ResourceConflictError("专业名称或编码已存在") from None


async def create_major(session: AsyncSession, payload: MajorCreate) -> Major:
    await _ensure_unique(session, name=payload.name, code=payload.code)
    major = Major(
        name=payload.name,
        code=payload.code,
        description=payload.description,
        status=RecordStatus.ACTIVE,
    )
    session.add(major)
    await _commit(session)
    return major


async def list_majors(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    keyword: str | None = None,
    record_status: RecordStatus | None = None,
) -> tuple[list[Major], int]:
    filters = []
    normalized_keyword = keyword.strip() if keyword is not None else ""
    if normalized_keyword:
        filters.append(
            or_(
                Major.name.contains(normalized_keyword, autoescape=True),
                Major.code.contains(normalized_keyword, autoescape=True),
            )
        )
    if record_status is not None:
        filters.append(Major.status == record_status)

    total = await session.scalar(select(func.count(Major.id)).where(*filters))
    query = (
        select(Major)
        .where(*filters)
        .order_by(Major.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await session.scalars(query)
    return list(result), int(total or 0)


async def get_major(session: AsyncSession, major_id: int) -> Major:
    major = await session.scalar(select(Major).where(Major.id == major_id))
    if major is None:
        raise ResourceNotFoundError("专业不存在")
    return major


async def update_major(
    session: AsyncSession,
    major_id: int,
    payload: MajorUpdate,
) -> Major:
    major = await get_major(session, major_id)
    await _ensure_unique(
        session,
        name=payload.name,
        code=payload.code,
        exclude_id=major.id,
    )
    major.name = payload.name
    major.code = payload.code
    major.description = payload.description
    await _commit(session)
    return major


async def update_major_status(
    session: AsyncSession,
    major_id: int,
    record_status: RecordStatus,
) -> Major:
    major = await get_major(session, major_id)
    major.status = record_status
    await _commit(session)
    return major
