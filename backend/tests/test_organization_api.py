import asyncio
from collections.abc import AsyncIterator
from typing import cast

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import Select, create_engine
from sqlalchemy.engine import ScalarResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.enums import RecordStatus
from app.db.models import Base, Class, Major, Role, User, UserRole
from app.db.session import get_db_session
from app.main import app
from app.modules.auth.security import create_access_token

ADMIN_USER_ID = 1
TEACHER_USER_ID = 2
STUDENT_USER_ID = 3

JsonScalar = str | int | None


class AsyncSessionAdapter:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._next_major_id = 100
        self._next_class_id = 200

    def add(self, instance: object) -> None:
        if isinstance(instance, Major) and instance.id is None:
            instance.id = self._next_major_id
            self._next_major_id += 1
        if isinstance(instance, Class) and instance.id is None:
            instance.id = self._next_class_id
            self._next_class_id += 1
        self._session.add(instance)

    async def scalar(self, statement: Select[tuple[object]]) -> object | None:
        return self._session.scalar(statement)

    async def scalars(self, statement: Select[tuple[object]]) -> ScalarResult[object]:
        return self._session.scalars(statement)

    async def commit(self) -> None:
        self._session.commit()

    async def rollback(self) -> None:
        self._session.rollback()


def _seed_test_data(session: Session) -> None:
    teacher_role = Role(id=1, code="teacher", name="教师", status=RecordStatus.ACTIVE)
    student_role = Role(id=2, code="student", name="学生", status=RecordStatus.ACTIVE)
    admin_role = Role(id=99, code="admin", name="管理员", status=RecordStatus.ACTIVE)

    admin = User(
        id=ADMIN_USER_ID,
        username="admin",
        password_hash="test-password-hash",
        real_name="管理员",
        status=RecordStatus.ACTIVE,
    )
    teacher = User(
        id=TEACHER_USER_ID,
        username="teacher",
        password_hash="test-password-hash",
        real_name="教师",
        status=RecordStatus.ACTIVE,
    )
    student = User(
        id=STUDENT_USER_ID,
        username="student",
        password_hash="test-password-hash",
        real_name="学生",
        status=RecordStatus.ACTIVE,
    )
    admin.role_assignments.append(UserRole(id=1, role=admin_role))
    teacher.role_assignments.append(UserRole(id=2, role=teacher_role))
    student.role_assignments.append(UserRole(id=3, role=student_role))

    cloud = Major(
        id=10,
        name="云计算",
        code="CLOUD",
        description="云计算技术方向",
        status=RecordStatus.ACTIVE,
    )
    ai_media = Major(
        id=11,
        name="AI数媒",
        code="AI_MEDIA",
        status=RecordStatus.DISABLED,
    )
    aigc = Major(
        id=12,
        name="AIGC",
        code="AIGC",
        status=RecordStatus.ACTIVE,
    )
    cloud.classes.extend(
        [
            Class(
                id=20,
                name="云计算2501班",
                code="CLOUD-2501",
                enrollment_year=2025,
                status=RecordStatus.ACTIVE,
            ),
            Class(
                id=22,
                name="云计算2601班",
                code="CLOUD-2601",
                enrollment_year=2026,
                status=RecordStatus.ACTIVE,
            ),
        ]
    )
    aigc.classes.append(
        Class(
            id=21,
            name="AIGC2401班",
            code="AIGC-2401",
            enrollment_year=2024,
            status=RecordStatus.DISABLED,
        )
    )
    session.add_all([admin, teacher, student, cloud, ai_media, aigc])


def _request(
    method: str,
    path: str,
    *,
    json: dict[str, JsonScalar] | None = None,
    user_id: int | None = ADMIN_USER_ID,
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
                return await client.request(method, path, json=json, headers=headers)
        finally:
            app.dependency_overrides.pop(get_db_session, None)
            test_engine.dispose()

    return asyncio.run(perform_request())


def _major_payload(*, name: str = "大数据", code: str = "BIGDATA") -> dict[str, JsonScalar]:
    return {
        "name": name,
        "code": code,
        "description": "大数据技术方向",
    }


def _class_payload(
    *,
    major_id: int = 10,
    code: str = "CLOUD-2701",
) -> dict[str, JsonScalar]:
    return {
        "major_id": major_id,
        "name": "云计算2701班",
        "code": code,
        "enrollment_year": 2027,
        "description": "2027级云计算1班",
    }


def test_admin_can_create_major_and_code_is_normalized() -> None:
    response = _request(
        "POST",
        "/api/v1/majors",
        json=_major_payload(code="  bigdata  "),
    )

    assert response.status_code == 201
    assert response.json()["code"] == "BIGDATA"
    assert response.json()["status"] == "active"


@pytest.mark.parametrize("user_id", [TEACHER_USER_ID, STUDENT_USER_ID])
def test_non_admin_cannot_create_major(user_id: int) -> None:
    response = _request(
        "POST",
        "/api/v1/majors",
        json=_major_payload(),
        user_id=user_id,
    )

    assert response.status_code == 403


def test_unauthenticated_user_cannot_access_major_api() -> None:
    response = _request("GET", "/api/v1/majors", user_id=None)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_duplicate_major_code_returns_409() -> None:
    response = _request(
        "POST",
        "/api/v1/majors",
        json=_major_payload(code=" cloud "),
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "专业编码已存在"}


def test_duplicate_major_name_returns_409() -> None:
    response = _request(
        "POST",
        "/api/v1/majors",
        json=_major_payload(name="云计算"),
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "专业名称已存在"}


def test_major_list_is_paginated() -> None:
    response = _request("GET", "/api/v1/majors?page=2&page_size=2")

    assert response.status_code == 200
    assert response.json()["total"] == 3
    assert response.json()["page"] == 2
    assert response.json()["page_size"] == 2
    assert len(response.json()["items"]) == 1


def test_major_list_supports_keyword_search() -> None:
    response = _request("GET", "/api/v1/majors?keyword=CLOUD")

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["name"] == "云计算"


def test_major_list_supports_status_filter() -> None:
    response = _request("GET", "/api/v1/majors?status=disabled")

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["code"] == "AI_MEDIA"


def test_admin_can_update_major() -> None:
    response = _request(
        "PUT",
        "/api/v1/majors/10",
        json={
            "name": "云平台技术",
            "code": " cloud_ops ",
            "description": "更新后的方向",
        },
    )

    assert response.status_code == 200
    assert response.json()["name"] == "云平台技术"
    assert response.json()["code"] == "CLOUD_OPS"


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "AI数媒", "code": "CLOUD", "description": None},
        {"name": "云计算", "code": "AI_MEDIA", "description": None},
    ],
)
def test_major_update_rejects_another_major_name_or_code(
    payload: dict[str, JsonScalar],
) -> None:
    response = _request("PUT", "/api/v1/majors/10", json=payload)

    assert response.status_code == 409


def test_admin_can_disable_major() -> None:
    response = _request(
        "PATCH",
        "/api/v1/majors/10/status",
        json={"status": "disabled"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "disabled"


def test_missing_major_returns_404() -> None:
    response = _request("GET", "/api/v1/majors/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "专业不存在"}


def test_admin_can_create_class_with_major_summary() -> None:
    response = _request(
        "POST",
        "/api/v1/classes",
        json=_class_payload(code=" cloud-2701 "),
    )

    assert response.status_code == 201
    assert response.json()["code"] == "CLOUD-2701"
    assert response.json()["status"] == "active"
    assert response.json()["major"] == {
        "id": 10,
        "name": "云计算",
        "code": "CLOUD",
    }


def test_teacher_cannot_create_class() -> None:
    response = _request(
        "POST",
        "/api/v1/classes",
        json=_class_payload(),
        user_id=TEACHER_USER_ID,
    )

    assert response.status_code == 403


def test_class_creation_with_missing_major_returns_404() -> None:
    response = _request(
        "POST",
        "/api/v1/classes",
        json=_class_payload(major_id=999),
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "专业不存在"}


def test_disabled_major_cannot_receive_new_class() -> None:
    response = _request(
        "POST",
        "/api/v1/classes",
        json=_class_payload(major_id=11),
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "所属专业已禁用，不能创建或调整班级"}


def test_duplicate_class_code_returns_409() -> None:
    response = _request(
        "POST",
        "/api/v1/classes",
        json=_class_payload(code=" cloud-2501 "),
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "班级编码已存在"}


def test_class_list_supports_major_filter() -> None:
    response = _request("GET", "/api/v1/classes?major_id=10")

    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert {item["major"]["code"] for item in response.json()["items"]} == {"CLOUD"}


def test_class_list_supports_enrollment_year_filter() -> None:
    response = _request("GET", "/api/v1/classes?enrollment_year=2024")

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["code"] == "AIGC-2401"


def test_class_list_supports_keyword_search_and_major_summary() -> None:
    response = _request("GET", "/api/v1/classes?keyword=2501")

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["major"] == {
        "id": 10,
        "name": "云计算",
        "code": "CLOUD",
    }


def test_admin_can_update_class_and_change_major() -> None:
    response = _request(
        "PUT",
        "/api/v1/classes/20",
        json={
            "major_id": 12,
            "name": "AIGC融合2501班",
            "code": " aigc-mix-2501 ",
            "enrollment_year": 2025,
            "description": "调整专业后的班级",
        },
    )

    assert response.status_code == 200
    assert response.json()["code"] == "AIGC-MIX-2501"
    assert response.json()["major_id"] == 12
    assert response.json()["major"]["code"] == "AIGC"


def test_class_update_rejects_duplicate_code() -> None:
    response = _request(
        "PUT",
        "/api/v1/classes/20",
        json={
            "major_id": 10,
            "name": "重复编码班级",
            "code": "CLOUD-2601",
            "enrollment_year": 2025,
            "description": None,
        },
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "班级编码已存在"}


def test_class_update_with_missing_major_returns_404() -> None:
    response = _request(
        "PUT",
        "/api/v1/classes/20",
        json={
            "major_id": 999,
            "name": "无效专业班",
            "code": "INVALID-MAJOR-CLASS",
            "enrollment_year": 2025,
            "description": None,
        },
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "专业不存在"}


def test_class_cannot_move_to_disabled_major() -> None:
    response = _request(
        "PUT",
        "/api/v1/classes/20",
        json={
            "major_id": 11,
            "name": "禁用专业班级",
            "code": "DISABLED-MAJOR-CLASS",
            "enrollment_year": 2025,
            "description": None,
        },
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "所属专业已禁用，不能创建或调整班级"}


def test_admin_can_disable_class() -> None:
    response = _request(
        "PATCH",
        "/api/v1/classes/20/status",
        json={"status": "disabled"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "disabled"
    assert response.json()["major"]["code"] == "CLOUD"


def test_missing_class_returns_404() -> None:
    response = _request("GET", "/api/v1/classes/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "班级不存在"}


def test_enrollment_year_outside_supported_range_returns_422() -> None:
    payload = _class_payload()
    payload["enrollment_year"] = 1800
    response = _request("POST", "/api/v1/classes", json=payload)

    assert response.status_code == 422


def test_system_managed_fields_are_rejected() -> None:
    payload = _major_payload()
    payload["id"] = 999
    response = _request("POST", "/api/v1/majors", json=payload)

    assert response.status_code == 422
