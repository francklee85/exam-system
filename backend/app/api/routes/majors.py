from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status

from app.core.schemas import PageResponse, StatusUpdate
from app.db.enums import RecordStatus
from app.modules.auth.dependencies import SessionDependency
from app.modules.auth.permissions import require_roles
from app.modules.majors import service
from app.modules.majors.schemas import MajorCreate, MajorResponse, MajorUpdate

router = APIRouter(
    prefix="/majors",
    tags=["majors"],
)


@router.get(
    "",
    response_model=PageResponse[MajorResponse],
    dependencies=[Depends(require_roles("admin", "teacher"))],
)
async def list_majors(
    session: SessionDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    record_status: Annotated[RecordStatus | None, Query(alias="status")] = None,
) -> PageResponse[MajorResponse]:
    items, total = await service.list_majors(
        session,
        page=page,
        page_size=page_size,
        keyword=keyword,
        record_status=record_status,
    )
    return PageResponse[MajorResponse](
        items=[MajorResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{major_id}",
    response_model=MajorResponse,
    dependencies=[Depends(require_roles("admin", "teacher"))],
)
async def get_major(
    major_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
) -> MajorResponse:
    major = await service.get_major(session, major_id)
    return MajorResponse.model_validate(major)


@router.post(
    "",
    response_model=MajorResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_roles("admin"))],
)
async def create_major(payload: MajorCreate, session: SessionDependency) -> MajorResponse:
    major = await service.create_major(session, payload)
    return MajorResponse.model_validate(major)


@router.put(
    "/{major_id}",
    response_model=MajorResponse,
    dependencies=[Depends(require_roles("admin"))],
)
async def update_major(
    major_id: Annotated[int, Path(gt=0)],
    payload: MajorUpdate,
    session: SessionDependency,
) -> MajorResponse:
    major = await service.update_major(session, major_id, payload)
    return MajorResponse.model_validate(major)


@router.patch(
    "/{major_id}/status",
    response_model=MajorResponse,
    dependencies=[Depends(require_roles("admin"))],
)
async def update_major_status(
    major_id: Annotated[int, Path(gt=0)],
    payload: StatusUpdate,
    session: SessionDependency,
) -> MajorResponse:
    major = await service.update_major_status(session, major_id, payload.status)
    return MajorResponse.model_validate(major)
