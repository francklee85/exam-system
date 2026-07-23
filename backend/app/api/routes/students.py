from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status

from app.core.schemas import PageResponse, StatusUpdate
from app.db.enums import RecordStatus
from app.modules.auth.dependencies import SessionDependency
from app.modules.auth.permissions import require_roles
from app.modules.students import service
from app.modules.students.schemas import StudentCreate, StudentResponse, StudentUpdate

router = APIRouter(
    prefix="/students",
    tags=["students"],
    dependencies=[Depends(require_roles("admin"))],
)


@router.get("", response_model=PageResponse[StudentResponse])
async def list_students(
    session: SessionDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    student_no: Annotated[str | None, Query(max_length=50)] = None,
    major_id: Annotated[int | None, Query(gt=0)] = None,
    class_id: Annotated[int | None, Query(gt=0)] = None,
    record_status: Annotated[RecordStatus | None, Query(alias="status")] = None,
) -> PageResponse[StudentResponse]:
    items, total = await service.list_students(
        session,
        page=page,
        page_size=page_size,
        keyword=keyword,
        student_no=student_no,
        major_id=major_id,
        class_id=class_id,
        record_status=record_status,
    )
    return PageResponse[StudentResponse](
        items=[StudentResponse.from_user(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{user_id}", response_model=StudentResponse)
async def get_student(
    user_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
) -> StudentResponse:
    student = await service.get_student(session, user_id)
    return StudentResponse.from_user(student)


@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    payload: StudentCreate,
    session: SessionDependency,
) -> StudentResponse:
    student = await service.create_student(session, payload)
    return StudentResponse.from_user(student)


@router.put("/{user_id}", response_model=StudentResponse)
async def update_student(
    user_id: Annotated[int, Path(gt=0)],
    payload: StudentUpdate,
    session: SessionDependency,
) -> StudentResponse:
    student = await service.update_student(session, user_id, payload)
    return StudentResponse.from_user(student)


@router.patch("/{user_id}/status", response_model=StudentResponse)
async def update_student_status(
    user_id: Annotated[int, Path(gt=0)],
    payload: StatusUpdate,
    session: SessionDependency,
) -> StudentResponse:
    student = await service.update_student_status(session, user_id, payload.status)
    return StudentResponse.from_user(student)
