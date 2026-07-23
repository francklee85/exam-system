from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.schemas import PageResponse
from app.db.enums import RecordStatus
from app.modules.auth.dependencies import SessionDependency
from app.modules.auth.permissions import require_roles
from app.modules.users import service
from app.modules.users.schemas import UserResponse

router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(require_roles("admin"))],
)


@router.get("", response_model=PageResponse[UserResponse])
async def list_users(
    session: SessionDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    role: Annotated[str | None, Query(min_length=1, max_length=50)] = None,
    record_status: Annotated[RecordStatus | None, Query(alias="status")] = None,
) -> PageResponse[UserResponse]:
    items, total = await service.list_users(
        session,
        page=page,
        page_size=page_size,
        keyword=keyword,
        role_code=role,
        record_status=record_status,
    )
    return PageResponse[UserResponse](
        items=[UserResponse.from_user(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )
