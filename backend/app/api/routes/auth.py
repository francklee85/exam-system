from fastapi import APIRouter

from app.db.mixins import utc_now
from app.modules.auth.dependencies import CurrentUserDependency, SessionDependency
from app.modules.auth.dependencies import unauthorized_exception as login_failed
from app.modules.auth.schemas import CurrentUserResponse, LoginRequest, TokenResponse
from app.modules.auth.security import create_access_token
from app.modules.auth.service import authenticate_user

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: SessionDependency) -> TokenResponse:
    user = await authenticate_user(
        session,
        username=payload.username,
        password=payload.password.get_secret_value(),
    )
    if user is None:
        raise login_failed("用户名或密码错误")

    user.last_login_at = utc_now()
    await session.commit()

    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=CurrentUserResponse)
async def get_me(current_user: CurrentUserDependency) -> CurrentUserResponse:
    return CurrentUserResponse.from_user(current_user)
