import asyncio
from collections.abc import AsyncIterator
from datetime import timedelta
from typing import cast

from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import Select, create_engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.enums import RecordStatus
from app.db.models import Base, Role, User, UserRole
from app.db.session import get_db_session
from app.main import app
from app.modules.auth.security import create_access_token, hash_password

TEST_PASSWORD = "Test-Admin-Password!"
TEST_PASSWORD_HASH = hash_password(TEST_PASSWORD)


class AsyncSessionAdapter:
    def __init__(self, session: Session) -> None:
        self._session = session

    async def scalar(self, statement: Select[tuple[User]]) -> User | None:
        return self._session.scalar(statement)

    async def commit(self) -> None:
        self._session.commit()


def _seed_test_users(session: Session) -> None:
    admin_role = Role(id=1, code="admin", name="管理员", status=RecordStatus.ACTIVE)
    active_user = User(
        id=1,
        username="admin",
        password_hash=TEST_PASSWORD_HASH,
        real_name="系统管理员",
        status=RecordStatus.ACTIVE,
    )
    disabled_user = User(
        id=2,
        username="disabled_user",
        password_hash=TEST_PASSWORD_HASH,
        real_name="禁用用户",
        status=RecordStatus.DISABLED,
    )
    active_user.role_assignments.append(UserRole(id=1, role=admin_role))
    session.add_all([active_user, disabled_user])


def _request(
    method: str,
    path: str,
    *,
    json: dict[str, str] | None = None,
    token: str | None = None,
) -> Response:
    async def perform_request() -> Response:
        test_engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(test_engine)
        with Session(test_engine) as session:
            _seed_test_users(session)
            session.commit()

        async def override_db_session() -> AsyncIterator[AsyncSession]:
            with Session(test_engine, expire_on_commit=False) as session:
                adapter = AsyncSessionAdapter(session)
                yield cast(AsyncSession, adapter)

        app.dependency_overrides[get_db_session] = override_db_session
        headers = {"Authorization": f"Bearer {token}"} if token is not None else None
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                return await client.request(method, path, json=json, headers=headers)
        finally:
            app.dependency_overrides.pop(get_db_session, None)
            test_engine.dispose()

    return asyncio.run(perform_request())


def test_login_with_correct_credentials_succeeds() -> None:
    response = _request(
        "POST",
        "/api/v1/auth/login",
        json={"username": "admin", "password": TEST_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert isinstance(response.json()["access_token"], str)


def test_login_with_wrong_password_fails() -> None:
    response = _request(
        "POST",
        "/api/v1/auth/login",
        json={"username": "admin", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "用户名或密码错误"}
    assert response.headers["www-authenticate"] == "Bearer"


def test_login_with_unknown_username_has_same_failure() -> None:
    response = _request(
        "POST",
        "/api/v1/auth/login",
        json={"username": "missing", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "用户名或密码错误"}


def test_disabled_user_cannot_login() -> None:
    response = _request(
        "POST",
        "/api/v1/auth/login",
        json={"username": "disabled_user", "password": TEST_PASSWORD},
    )

    assert response.status_code == 401


def test_current_user_with_valid_token_succeeds_without_password_hash() -> None:
    response = _request("GET", "/api/v1/auth/me", token=create_access_token(1))

    assert response.status_code == 200
    assert response.json() == {
        "id": 1,
        "username": "admin",
        "real_name": "系统管理员",
        "roles": ["admin"],
    }
    assert "password_hash" not in response.json()


def test_current_user_without_token_returns_401() -> None:
    response = _request("GET", "/api/v1/auth/me")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_current_user_with_invalid_token_returns_401() -> None:
    response = _request("GET", "/api/v1/auth/me", token="invalid-token")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_current_user_with_expired_token_returns_401() -> None:
    expired_token = create_access_token(1, expires_delta=timedelta(seconds=-1))
    response = _request("GET", "/api/v1/auth/me", token=expired_token)

    assert response.status_code == 401


def test_current_user_rechecks_user_existence_and_status() -> None:
    missing_user_response = _request("GET", "/api/v1/auth/me", token=create_access_token(999))
    disabled_user_response = _request("GET", "/api/v1/auth/me", token=create_access_token(2))

    assert missing_user_response.status_code == 401
    assert disabled_user_response.status_code == 401


def test_login_request_validation_returns_422() -> None:
    response = _request(
        "POST",
        "/api/v1/auth/login",
        json={"username": "", "password": ""},
    )

    assert response.status_code == 422
