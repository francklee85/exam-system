from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status

from app.core.schemas import PageResponse, StatusUpdate
from app.db.enums import RecordStatus
from app.modules.auth.dependencies import SessionDependency
from app.modules.auth.permissions import require_roles
from app.modules.classes import service
from app.modules.classes.schemas import ClassCreate, ClassResponse, ClassUpdate

router = APIRouter(
    prefix="/classes",
    tags=["classes"],
    dependencies=[Depends(require_roles("admin"))],
)


@router.get("", response_model=PageResponse[ClassResponse])
async def list_classes(
    session: SessionDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    major_id: Annotated[int | None, Query(gt=0)] = None,
    record_status: Annotated[RecordStatus | None, Query(alias="status")] = None,
    enrollment_year: Annotated[int | None, Query(ge=1900, le=2100)] = None,
) -> PageResponse[ClassResponse]:
    items, total = await service.list_classes(
        session,
        page=page,
        page_size=page_size,
        keyword=keyword,
        major_id=major_id,
        record_status=record_status,
        enrollment_year=enrollment_year,
    )
    return PageResponse[ClassResponse](
        items=[ClassResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{class_id}", response_model=ClassResponse)
async def get_class(
    class_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
) -> ClassResponse:
    class_record = await service.get_class(session, class_id)
    return ClassResponse.model_validate(class_record)


@router.post("", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
async def create_class(payload: ClassCreate, session: SessionDependency) -> ClassResponse:
    class_record = await service.create_class(session, payload)
    return ClassResponse.model_validate(class_record)


@router.put("/{class_id}", response_model=ClassResponse)
async def update_class(
    class_id: Annotated[int, Path(gt=0)],
    payload: ClassUpdate,
    session: SessionDependency,
) -> ClassResponse:
    class_record = await service.update_class(session, class_id, payload)
    return ClassResponse.model_validate(class_record)


@router.patch("/{class_id}/status", response_model=ClassResponse)
async def update_class_status(
    class_id: Annotated[int, Path(gt=0)],
    payload: StatusUpdate,
    session: SessionDependency,
) -> ClassResponse:
    class_record = await service.update_class_status(session, class_id, payload.status)
    return ClassResponse.model_validate(class_record)
