from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status

from app.core.schemas import PageResponse, StatusUpdate
from app.db.enums import RecordStatus
from app.modules.auth.dependencies import SessionDependency
from app.modules.auth.permissions import require_roles
from app.modules.teachers import service
from app.modules.teachers.schemas import TeacherCreate, TeacherResponse, TeacherUpdate

router = APIRouter(
    prefix="/teachers",
    tags=["teachers"],
    dependencies=[Depends(require_roles("admin"))],
)


@router.get("", response_model=PageResponse[TeacherResponse])
async def list_teachers(
    session: SessionDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    record_status: Annotated[RecordStatus | None, Query(alias="status")] = None,
) -> PageResponse[TeacherResponse]:
    items, total = await service.list_teachers(
        session,
        page=page,
        page_size=page_size,
        keyword=keyword,
        record_status=record_status,
    )
    return PageResponse[TeacherResponse](
        items=[TeacherResponse.from_user(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{user_id}", response_model=TeacherResponse)
async def get_teacher(
    user_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
) -> TeacherResponse:
    teacher = await service.get_teacher(session, user_id)
    return TeacherResponse.from_user(teacher)


@router.post("", response_model=TeacherResponse, status_code=status.HTTP_201_CREATED)
async def create_teacher(
    payload: TeacherCreate,
    session: SessionDependency,
) -> TeacherResponse:
    teacher = await service.create_teacher(session, payload)
    return TeacherResponse.from_user(teacher)


@router.put("/{user_id}", response_model=TeacherResponse)
async def update_teacher(
    user_id: Annotated[int, Path(gt=0)],
    payload: TeacherUpdate,
    session: SessionDependency,
) -> TeacherResponse:
    teacher = await service.update_teacher(session, user_id, payload)
    return TeacherResponse.from_user(teacher)


@router.patch("/{user_id}/status", response_model=TeacherResponse)
async def update_teacher_status(
    user_id: Annotated[int, Path(gt=0)],
    payload: StatusUpdate,
    session: SessionDependency,
) -> TeacherResponse:
    teacher = await service.update_teacher_status(session, user_id, payload.status)
    return TeacherResponse.from_user(teacher)
