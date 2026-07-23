import asyncio
from collections.abc import AsyncIterator, Callable
from typing import cast

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import Select, create_engine, select
from sqlalchemy.engine import ScalarResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.pool import StaticPool

from app.db.enums import RecordStatus
from app.db.models import Base, Class, Major, Role, StudentProfile, User, UserRole
from app.db.session import get_db_session
from app.main import app
from app.modules.auth.security import create_access_token, hash_password, verify_password

ADMIN_USER_ID = 1
TEACHER_USER_ID = 2
DISABLED_TEACHER_USER_ID = 3
STUDENT_USER_ID = 4
DISABLED_STUDENT_USER_ID = 5
TEST_PASSWORD = "Existing-User-Password!"
TEST_PASSWORD_HASH = hash_password(TEST_PASSWORD)

JsonScalar = str | int | None


class AsyncSessionAdapter:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._next_user_id = 100
        self._next_user_role_id = 200
        self._next_profile_id = 300

    def add(self, instance: object) -> None:
        if isinstance(instance, User):
            if instance.id is None:
                instance.id = self._next_user_id
                self._next_user_id += 1
            for assignment in instance.role_assignments:
                if assignment.id is None:
                    assignment.id = self._next_user_role_id
                    self._next_user_role_id += 1
            if instance.student_profile is not None and instance.student_profile.id is None:
                instance.student_profile.id = self._next_profile_id
                self._next_profile_id += 1
        self._session.add(instance)

    async def scalar(self, statement: Select[tuple[object]]) -> object | None:
        return self._session.scalar(statement)

    async def scalars(self, statement: Select[tuple[object]]) -> ScalarResult[object]:
        return self._session.scalars(statement)

    async def commit(self) -> None:
        self._session.commit()

    async def rollback(self) -> None:
        self._session.rollback()


def _user(
    *,
    user_id: int,
    username: str,
    real_name: str,
    status: RecordStatus = RecordStatus.ACTIVE,
) -> User:
    return User(
        id=user_id,
        username=username,
        password_hash=TEST_PASSWORD_HASH,
        real_name=real_name,
        status=status,
    )


def _seed_test_data(session: Session) -> None:
    teacher_role = Role(id=1, code="teacher", name="教师", status=RecordStatus.ACTIVE)
    student_role = Role(id=2, code="student", name="学生", status=RecordStatus.ACTIVE)
    admin_role = Role(id=99, code="admin", name="管理员", status=RecordStatus.ACTIVE)

    admin = _user(user_id=ADMIN_USER_ID, username="admin", real_name="系统管理员")
    teacher = _user(
        user_id=TEACHER_USER_ID,
        username="teacher001",
        real_name="李老师",
    )
    disabled_teacher = _user(
        user_id=DISABLED_TEACHER_USER_ID,
        username="teacher_disabled",
        real_name="禁用教师",
        status=RecordStatus.DISABLED,
    )
    student = _user(
        user_id=STUDENT_USER_ID,
        username="20260001",
        real_name="张三",
    )
    disabled_student = _user(
        user_id=DISABLED_STUDENT_USER_ID,
        username="20260002",
        real_name="李四",
        status=RecordStatus.DISABLED,
    )

    admin.role_assignments.append(UserRole(id=1, role=admin_role))
    teacher.role_assignments.append(UserRole(id=2, role=teacher_role))
    disabled_teacher.role_assignments.append(UserRole(id=3, role=teacher_role))
    student.role_assignments.append(UserRole(id=4, role=student_role))
    disabled_student.role_assignments.append(UserRole(id=5, role=student_role))

    cloud = Major(id=10, name="云计算", code="CLOUD", status=RecordStatus.ACTIVE)
    aigc = Major(id=11, name="AIGC", code="AIGC", status=RecordStatus.ACTIVE)
    disabled_major = Major(
        id=12,
        name="已禁用专业",
        code="DISABLED_MAJOR",
        status=RecordStatus.DISABLED,
    )
    cloud_class = Class(
        id=20,
        major=cloud,
        name="云计算2501班",
        code="CLOUD-2501",
        enrollment_year=2025,
        status=RecordStatus.ACTIVE,
    )
    aigc_class = Class(
        id=21,
        major=aigc,
        name="AIGC2501班",
        code="AIGC-2501",
        enrollment_year=2025,
        status=RecordStatus.ACTIVE,
    )
    disabled_class = Class(
        id=22,
        major=cloud,
        name="已禁用班级",
        code="DISABLED-CLASS",
        status=RecordStatus.DISABLED,
    )
    class_in_disabled_major = Class(
        id=23,
        major=disabled_major,
        name="禁用专业下班级",
        code="DISABLED-MAJOR-CLASS",
        status=RecordStatus.ACTIVE,
    )
    student.student_profile = StudentProfile(
        id=1,
        student_no="20260001",
        student_class=cloud_class,
    )
    disabled_student.student_profile = StudentProfile(
        id=2,
        student_no="20260002",
        student_class=cloud_class,
    )
    session.add_all(
        [
            admin,
            teacher,
            disabled_teacher,
            student,
            disabled_student,
            cloud,
            aigc,
            disabled_major,
            aigc_class,
            disabled_class,
            class_in_disabled_major,
        ]
    )


def _request(
    method: str,
    path: str,
    *,
    json: dict[str, JsonScalar] | None = None,
    user_id: int | None = ADMIN_USER_ID,
    inspect: Callable[[Session], None] | None = None,
) -> Response:
    async def perform_request() -> Response:
        test_engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(test_engine)
        with Session(test_engine) as session:
            _seed_test_data(session)
            session.commit()

        async def override_db_session() -> AsyncIterator[AsyncSession]:
            with Session(test_engine, expire_on_commit=False) as session:
                yield cast(AsyncSession, AsyncSessionAdapter(session))

        app.dependency_overrides[get_db_session] = override_db_session
        headers = (
            {"Authorization": f"Bearer {create_access_token(user_id)}"}
            if user_id is not None
            else None
        )
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.request(method, path, json=json, headers=headers)
            if inspect is not None:
                with Session(test_engine) as session:
                    inspect(session)
            return response
        finally:
            app.dependency_overrides.pop(get_db_session, None)
            test_engine.dispose()

    return asyncio.run(perform_request())


def _teacher_payload(
    *,
    username: str = "teacher_new",
    password: str = "InitialPassword123!",
    real_name: str = "王老师",
) -> dict[str, JsonScalar]:
    return {"username": username, "password": password, "real_name": real_name}


def _student_payload(
    *,
    username: str = "20260003",
    student_no: str = "20260003",
    class_id: int = 20,
) -> dict[str, JsonScalar]:
    return {
        "username": username,
        "password": "InitialPassword123!",
        "real_name": "王五",
        "student_no": student_no,
        "class_id": class_id,
    }


def test_admin_can_create_teacher_with_hashed_password_and_teacher_role() -> None:
    def inspect_teacher(session: Session) -> None:
        teacher = session.scalar(
            select(User).where(User.username == "teacher_new").options(selectinload(User.roles))
        )
        assert teacher is not None
        assert teacher.password_hash != "InitialPassword123!"
        assert verify_password("InitialPassword123!", teacher.password_hash)
        assert [role.code for role in teacher.roles] == ["teacher"]

    response = _request(
        "POST",
        "/api/v1/teachers",
        json=_teacher_payload(),
        inspect=inspect_teacher,
    )

    assert response.status_code == 201
    assert response.json()["status"] == "active"
    assert response.json()["roles"] == ["teacher"]
    assert "password" not in response.json()
    assert "password_hash" not in response.json()


def test_teacher_cannot_create_teacher() -> None:
    response = _request(
        "POST",
        "/api/v1/teachers",
        json=_teacher_payload(),
        user_id=TEACHER_USER_ID,
    )

    assert response.status_code == 403


def test_unauthenticated_user_cannot_access_teacher_api() -> None:
    response = _request("GET", "/api/v1/teachers", user_id=None)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_duplicate_teacher_username_returns_409() -> None:
    response = _request(
        "POST",
        "/api/v1/teachers",
        json=_teacher_payload(username="teacher001"),
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "用户名已存在"}


def test_teacher_list_only_returns_teacher_role_users() -> None:
    response = _request("GET", "/api/v1/teachers")

    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert {item["username"] for item in response.json()["items"]} == {
        "teacher001",
        "teacher_disabled",
    }


def test_teacher_list_supports_keyword_and_status_filters() -> None:
    keyword_response = _request("GET", "/api/v1/teachers?keyword=李老师")
    status_response = _request("GET", "/api/v1/teachers?status=disabled")

    assert keyword_response.status_code == 200
    assert keyword_response.json()["total"] == 1
    assert keyword_response.json()["items"][0]["username"] == "teacher001"
    assert status_response.status_code == 200
    assert status_response.json()["total"] == 1
    assert status_response.json()["items"][0]["username"] == "teacher_disabled"


def test_teacher_detail_requires_teacher_role() -> None:
    teacher_response = _request("GET", f"/api/v1/teachers/{TEACHER_USER_ID}")
    non_teacher_response = _request("GET", f"/api/v1/teachers/{ADMIN_USER_ID}")

    assert teacher_response.status_code == 200
    assert teacher_response.json()["real_name"] == "李老师"
    assert non_teacher_response.status_code == 404


def test_admin_can_update_teacher_identity_without_password_fields() -> None:
    response = _request(
        "PUT",
        f"/api/v1/teachers/{TEACHER_USER_ID}",
        json={"username": "teacher_updated", "real_name": "李教授"},
    )

    assert response.status_code == 200
    assert response.json()["username"] == "teacher_updated"
    assert response.json()["real_name"] == "李教授"
    assert "password_hash" not in response.json()


def test_admin_can_disable_teacher() -> None:
    response = _request(
        "PATCH",
        f"/api/v1/teachers/{TEACHER_USER_ID}/status",
        json={"status": "disabled"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "disabled"


def test_disabled_teacher_cannot_login() -> None:
    response = _request(
        "POST",
        "/api/v1/auth/login",
        json={"username": "teacher_disabled", "password": TEST_PASSWORD},
        user_id=None,
    )

    assert response.status_code == 401


def test_admin_can_create_student_with_profile_role_class_and_major() -> None:
    def inspect_student(session: Session) -> None:
        student = session.scalar(
            select(User)
            .where(User.username == "20260003")
            .options(selectinload(User.roles), selectinload(User.student_profile))
        )
        assert student is not None
        assert verify_password("InitialPassword123!", student.password_hash)
        assert [role.code for role in student.roles] == ["student"]
        assert student.student_profile is not None
        assert student.student_profile.student_no == "20260003"
        assert student.student_profile.class_id == 20

    response = _request(
        "POST",
        "/api/v1/students",
        json=_student_payload(),
        inspect=inspect_student,
    )

    assert response.status_code == 201
    assert response.json()["roles"] == ["student"]
    assert response.json()["student_no"] == "20260003"
    assert response.json()["class"]["code"] == "CLOUD-2501"
    assert response.json()["major"]["code"] == "CLOUD"
    assert "password_hash" not in response.json()


def test_teacher_cannot_create_student() -> None:
    response = _request(
        "POST",
        "/api/v1/students",
        json=_student_payload(),
        user_id=TEACHER_USER_ID,
    )

    assert response.status_code == 403


@pytest.mark.parametrize(
    ("payload", "detail"),
    [
        (_student_payload(username="teacher001"), "用户名已存在"),
        (_student_payload(student_no="20260001"), "学号已存在"),
    ],
)
def test_student_creation_rejects_duplicate_identifiers(
    payload: dict[str, JsonScalar],
    detail: str,
) -> None:
    response = _request("POST", "/api/v1/students", json=payload)

    assert response.status_code == 409
    assert response.json() == {"detail": detail}


def test_student_creation_with_missing_class_returns_404() -> None:
    response = _request(
        "POST",
        "/api/v1/students",
        json=_student_payload(class_id=999),
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "班级不存在"}


def test_disabled_class_cannot_receive_new_student() -> None:
    response = _request(
        "POST",
        "/api/v1/students",
        json=_student_payload(class_id=22),
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "班级已禁用，不能分配学生"}


def test_class_in_disabled_major_cannot_receive_new_student() -> None:
    response = _request(
        "POST",
        "/api/v1/students",
        json=_student_payload(class_id=23),
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "班级所属专业已禁用，不能分配学生"}


def test_student_profile_does_not_store_major_id() -> None:
    assert "major_id" not in Base.metadata.tables["student_profiles"].columns


def test_student_detail_returns_profile_class_and_derived_major() -> None:
    response = _request("GET", f"/api/v1/students/{STUDENT_USER_ID}")

    assert response.status_code == 200
    assert response.json()["student_no"] == "20260001"
    assert response.json()["class"]["name"] == "云计算2501班"
    assert response.json()["major"]["name"] == "云计算"


@pytest.mark.parametrize(
    ("query", "expected_username"),
    [
        ("major_id=10", "20260001"),
        ("class_id=20", "20260001"),
        ("student_no=20260002", "20260002"),
        ("keyword=张三", "20260001"),
    ],
)
def test_student_list_filters(query: str, expected_username: str) -> None:
    response = _request("GET", f"/api/v1/students?{query}")

    assert response.status_code == 200
    assert response.json()["total"] >= 1
    assert expected_username in {item["username"] for item in response.json()["items"]}


def test_updating_student_class_derives_new_major() -> None:
    def inspect_student(session: Session) -> None:
        profile = session.scalar(
            select(StudentProfile).where(StudentProfile.user_id == STUDENT_USER_ID)
        )
        assert profile is not None
        assert profile.class_id == 21

    response = _request(
        "PUT",
        f"/api/v1/students/{STUDENT_USER_ID}",
        json={
            "username": "20260001",
            "real_name": "张三",
            "student_no": "20260001",
            "class_id": 21,
        },
        inspect=inspect_student,
    )

    assert response.status_code == 200
    assert response.json()["class"]["code"] == "AIGC-2501"
    assert response.json()["major"]["code"] == "AIGC"


def test_admin_can_disable_student() -> None:
    response = _request(
        "PATCH",
        f"/api/v1/students/{STUDENT_USER_ID}/status",
        json={"status": "disabled"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "disabled"


def test_disabled_student_cannot_login() -> None:
    response = _request(
        "POST",
        "/api/v1/auth/login",
        json={"username": "20260002", "password": TEST_PASSWORD},
        user_id=None,
    )

    assert response.status_code == 401


def test_admin_can_query_all_users_without_password_fields() -> None:
    response = _request("GET", "/api/v1/users")

    assert response.status_code == 200
    assert response.json()["total"] == 5
    assert all("password_hash" not in item for item in response.json()["items"])


@pytest.mark.parametrize(
    ("query", "expected_usernames"),
    [
        ("role=teacher", {"teacher001", "teacher_disabled"}),
        ("status=disabled", {"teacher_disabled", "20260002"}),
        ("keyword=张三", {"20260001"}),
    ],
)
def test_user_list_filters(query: str, expected_usernames: set[str]) -> None:
    response = _request("GET", f"/api/v1/users?{query}")

    assert response.status_code == 200
    assert {item["username"] for item in response.json()["items"]} == expected_usernames
