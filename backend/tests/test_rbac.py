import asyncio
from collections.abc import AsyncIterator
from typing import cast

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import Select, create_engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.routes.auth import router as auth_router
from app.db.enums import RecordStatus
from app.db.models import Base, Role, User, UserRole
from app.db.session import get_db_session
from app.modules.auth.permissions import AdminOnly, StudentOnly, TeacherOrAdmin
from app.modules.auth.security import create_access_token, hash_password

ADMIN_USER_ID = 10
TEACHER_USER_ID = 20
STUDENT_USER_ID = 30
DISABLED_ADMIN_USER_ID = 40
MULTI_ROLE_USER_ID = 50

rbac_router = APIRouter(prefix="/api/v1/rbac")


@rbac_router.get("/admin-only")
async def admin_only(current_user: AdminOnly) -> dict[str, str]:
    return {"username": current_user.username}


@rbac_router.get("/staff-only")
async def staff_only(current_user: TeacherOrAdmin) -> dict[str, str]:
    return {"username": current_user.username}


@rbac_router.get("/student-only")
async def student_only(current_user: StudentOnly) -> dict[str, str]:
    return {"username": current_user.username}


rbac_test_app = FastAPI()
rbac_test_app.include_router(auth_router, prefix="/api/v1")
rbac_test_app.include_router(rbac_router)


class AsyncSessionAdapter:
    def __init__(self, session: Session) -> None:
        self._session = session

    async def scalar(self, statement: Select[tuple[User]]) -> User | None:
        return self._session.scalar(statement)


def _user(
    *,
    user_id: int,
    username: str,
    status: RecordStatus = RecordStatus.ACTIVE,
) -> User:
    return User(
        id=user_id,
        username=username,
        password_hash=hash_password(f"{username}-password"),
        real_name=username,
        status=status,
    )


def _seed_test_users(session: Session) -> None:
    # Deliberately assign role IDs that do not match conventional role ordering.
    teacher_role = Role(id=1, code="teacher", name="教师", status=RecordStatus.ACTIVE)
    student_role = Role(id=2, code="student", name="学生", status=RecordStatus.ACTIVE)
    admin_role = Role(id=99, code="admin", name="管理员", status=RecordStatus.ACTIVE)

    admin = _user(user_id=ADMIN_USER_ID, username="admin")
    teacher = _user(user_id=TEACHER_USER_ID, username="teacher")
    student = _user(user_id=STUDENT_USER_ID, username="student")
    disabled_admin = _user(
        user_id=DISABLED_ADMIN_USER_ID,
        username="disabled_admin",
        status=RecordStatus.DISABLED,
    )
    multi_role_user = _user(user_id=MULTI_ROLE_USER_ID, username="multi_role")

    admin.role_assignments.append(UserRole(id=1, role=admin_role))
    teacher.role_assignments.append(UserRole(id=2, role=teacher_role))
    student.role_assignments.append(UserRole(id=3, role=student_role))
    disabled_admin.role_assignments.append(UserRole(id=4, role=admin_role))
    multi_role_user.role_assignments.extend(
        [
            UserRole(id=5, role=teacher_role),
            UserRole(id=6, role=admin_role),
        ]
    )
    session.add_all([admin, teacher, student, disabled_admin, multi_role_user])


def _request(path: str, *, user_id: int | None = None) -> Response:
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
                yield cast(AsyncSession, AsyncSessionAdapter(session))

        rbac_test_app.dependency_overrides[get_db_session] = override_db_session
        headers = (
            {"Authorization": f"Bearer {create_access_token(user_id)}"}
            if user_id is not None
            else None
        )
        try:
            transport = ASGITransport(app=rbac_test_app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                return await client.get(path, headers=headers)
        finally:
            rbac_test_app.dependency_overrides.pop(get_db_session, None)
            test_engine.dispose()

    return asyncio.run(perform_request())


def test_unauthenticated_user_gets_401() -> None:
    response = _request("/api/v1/rbac/admin-only")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    ("user_id", "path", "expected_status"),
    [
        (ADMIN_USER_ID, "/api/v1/rbac/admin-only", 200),
        (TEACHER_USER_ID, "/api/v1/rbac/admin-only", 403),
        (STUDENT_USER_ID, "/api/v1/rbac/admin-only", 403),
        (ADMIN_USER_ID, "/api/v1/rbac/staff-only", 200),
        (TEACHER_USER_ID, "/api/v1/rbac/staff-only", 200),
        (STUDENT_USER_ID, "/api/v1/rbac/staff-only", 403),
        (STUDENT_USER_ID, "/api/v1/rbac/student-only", 200),
        (ADMIN_USER_ID, "/api/v1/rbac/student-only", 403),
        (TEACHER_USER_ID, "/api/v1/rbac/student-only", 403),
    ],
)
def test_role_access_matrix(user_id: int, path: str, expected_status: int) -> None:
    response = _request(path, user_id=user_id)

    assert response.status_code == expected_status
    if expected_status == 403:
        assert response.json() == {"detail": "权限不足"}
        assert "www-authenticate" not in response.headers


def test_disabled_user_with_valid_token_gets_401() -> None:
    response = _request(
        "/api/v1/rbac/admin-only",
        user_id=DISABLED_ADMIN_USER_ID,
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_multi_role_user_can_access_admin_and_staff_routes() -> None:
    admin_response = _request(
        "/api/v1/rbac/admin-only",
        user_id=MULTI_ROLE_USER_ID,
    )
    staff_response = _request(
        "/api/v1/rbac/staff-only",
        user_id=MULTI_ROLE_USER_ID,
    )

    assert admin_response.status_code == 200
    assert staff_response.status_code == 200


def test_authorization_uses_role_code_instead_of_database_id() -> None:
    # Role ID 1 belongs to teacher, while admin deliberately uses role ID 99.
    teacher_response = _request(
        "/api/v1/rbac/admin-only",
        user_id=TEACHER_USER_ID,
    )
    admin_response = _request(
        "/api/v1/rbac/admin-only",
        user_id=ADMIN_USER_ID,
    )

    assert teacher_response.status_code == 403
    assert admin_response.status_code == 200


@pytest.mark.parametrize(
    ("user_id", "expected_roles"),
    [
        (ADMIN_USER_ID, ["admin"]),
        (MULTI_ROLE_USER_ID, ["admin", "teacher"]),
    ],
)
def test_auth_me_returns_all_roles(user_id: int, expected_roles: list[str]) -> None:
    response = _request("/api/v1/auth/me", user_id=user_id)

    assert response.status_code == 200
    assert response.json()["roles"] == expected_roles
