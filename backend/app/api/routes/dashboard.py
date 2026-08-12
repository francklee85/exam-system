from fastapi import APIRouter

from app.modules.auth.dependencies import CurrentUserDependency, SessionDependency
from app.modules.dashboard import service
from app.modules.dashboard.schemas import DashboardResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    session: SessionDependency,
    current_user: CurrentUserDependency,
) -> DashboardResponse:
    return await service.get_dashboard(session, current_user)
