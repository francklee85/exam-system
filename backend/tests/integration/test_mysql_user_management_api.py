import asyncio
import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.db.models import Class, StudentProfile, User, UserRole
from app.db.session import AsyncSessionFactory, engine
from app.main import app
from app.modules.auth.security import verify_password

RUN_MYSQL_USER_MANAGEMENT_TESTS = os.getenv("RUN_MYSQL_USER_MANAGEMENT_TESTS") == "1"
ADMIN_USERNAME = os.getenv("MYSQL_AUTH_TEST_USERNAME")
ADMIN_PASSWORD = os.getenv("MYSQL_AUTH_TEST_PASSWORD")
ADMIN_IS_CONFIGURED = ADMIN_USERNAME is not None and ADMIN_PASSWORD is not None

TEACHER_USERNAME = "teacher001"
TEACHER_PASSWORD = "Teacher-Integration-Password!"
STUDENT_USERNAME = "20260001"
STUDENT_PASSWORD = "Student-Integration-Password!"


@pytest.mark.skipif(
    not RUN_MYSQL_USER_MANAGEMENT_TESTS or not ADMIN_IS_CONFIGURED,
    reason="set the MySQL user-management flag and admin credentials",
)
def test_mysql_teacher_and_student_management_flow() -> None:
    async def exercise_api_flow() -> None:
        assert ADMIN_USERNAME is not None
        assert ADMIN_PASSWORD is not None

        cleanup_allowed = False
        try:
            async with AsyncSessionFactory() as session:
                existing_user = await session.scalar(
                    select(User.id).where(User.username.in_([TEACHER_USERNAME, STUDENT_USERNAME]))
                )
                existing_class = await session.scalar(
                    select(Class.id).where(Class.code.in_(["CLOUD-2501", "AIGC-2501"]))
                )
                assert existing_user is None
                assert existing_class is None
            cleanup_allowed = True

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                login_response = await client.post(
                    "/api/v1/auth/login",
                    json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
                )
                assert login_response.status_code == 200
                headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

                cloud_response = await client.get(
                    "/api/v1/majors?keyword=CLOUD",
                    headers=headers,
                )
                aigc_response = await client.get(
                    "/api/v1/majors?keyword=AIGC",
                    headers=headers,
                )
                assert cloud_response.status_code == 200
                assert aigc_response.status_code == 200
                cloud = next(
                    item for item in cloud_response.json()["items"] if item["code"] == "CLOUD"
                )
                aigc = next(
                    item for item in aigc_response.json()["items"] if item["code"] == "AIGC"
                )

                cloud_class_response = await client.post(
                    "/api/v1/classes",
                    headers=headers,
                    json={
                        "major_id": cloud["id"],
                        "name": "云计算2501班",
                        "code": "CLOUD-2501",
                        "enrollment_year": 2025,
                        "description": "用户管理集成测试班级",
                    },
                )
                aigc_class_response = await client.post(
                    "/api/v1/classes",
                    headers=headers,
                    json={
                        "major_id": aigc["id"],
                        "name": "AIGC2501班",
                        "code": "AIGC-2501",
                        "enrollment_year": 2025,
                        "description": "换班集成测试班级",
                    },
                )
                assert cloud_class_response.status_code == 201
                assert aigc_class_response.status_code == 201
                cloud_class = cloud_class_response.json()
                aigc_class = aigc_class_response.json()

                teacher_response = await client.post(
                    "/api/v1/teachers",
                    headers=headers,
                    json={
                        "username": TEACHER_USERNAME,
                        "password": TEACHER_PASSWORD,
                        "real_name": "李老师",
                    },
                )
                student_response = await client.post(
                    "/api/v1/students",
                    headers=headers,
                    json={
                        "username": STUDENT_USERNAME,
                        "password": STUDENT_PASSWORD,
                        "real_name": "张三",
                        "student_no": STUDENT_USERNAME,
                        "class_id": cloud_class["id"],
                    },
                )
                assert teacher_response.status_code == 201
                assert teacher_response.json()["roles"] == ["teacher"]
                assert student_response.status_code == 201
                student = student_response.json()
                assert student["class"]["name"] == "云计算2501班"
                assert student["major"]["name"] == "云计算"

                async with AsyncSessionFactory() as session:
                    teacher = await session.scalar(
                        select(User)
                        .where(User.username == TEACHER_USERNAME)
                        .options(selectinload(User.roles))
                    )
                    stored_student = await session.scalar(
                        select(User)
                        .where(User.username == STUDENT_USERNAME)
                        .options(
                            selectinload(User.roles),
                            selectinload(User.student_profile),
                        )
                    )
                    assert teacher is not None
                    assert verify_password(TEACHER_PASSWORD, teacher.password_hash)
                    assert [role.code for role in teacher.roles] == ["teacher"]
                    assert stored_student is not None
                    assert verify_password(STUDENT_PASSWORD, stored_student.password_hash)
                    assert [role.code for role in stored_student.roles] == ["student"]
                    assert stored_student.student_profile is not None
                    assert stored_student.student_profile.class_id == cloud_class["id"]

                student_detail = await client.get(
                    f"/api/v1/students/{student['id']}",
                    headers=headers,
                )
                assert student_detail.status_code == 200
                assert student_detail.json()["class"]["code"] == "CLOUD-2501"
                assert student_detail.json()["major"]["code"] == "CLOUD"

                moved_student_response = await client.put(
                    f"/api/v1/students/{student['id']}",
                    headers=headers,
                    json={
                        "username": STUDENT_USERNAME,
                        "real_name": "张三",
                        "student_no": STUDENT_USERNAME,
                        "class_id": aigc_class["id"],
                    },
                )
                assert moved_student_response.status_code == 200
                assert moved_student_response.json()["class"]["code"] == "AIGC-2501"
                assert moved_student_response.json()["major"]["code"] == "AIGC"

                teacher_status_response = await client.patch(
                    f"/api/v1/teachers/{teacher_response.json()['id']}/status",
                    headers=headers,
                    json={"status": "disabled"},
                )
                student_status_response = await client.patch(
                    f"/api/v1/students/{student['id']}/status",
                    headers=headers,
                    json={"status": "disabled"},
                )
                assert teacher_status_response.status_code == 200
                assert student_status_response.status_code == 200

                disabled_teacher_login = await client.post(
                    "/api/v1/auth/login",
                    json={"username": TEACHER_USERNAME, "password": TEACHER_PASSWORD},
                )
                disabled_student_login = await client.post(
                    "/api/v1/auth/login",
                    json={"username": STUDENT_USERNAME, "password": STUDENT_PASSWORD},
                )
                assert disabled_teacher_login.status_code == 401
                assert disabled_student_login.status_code == 401
        finally:
            if cleanup_allowed:
                async with AsyncSessionFactory.begin() as session:
                    user_ids = list(
                        await session.scalars(
                            select(User.id).where(
                                User.username.in_([TEACHER_USERNAME, STUDENT_USERNAME])
                            )
                        )
                    )
                    if user_ids:
                        await session.execute(
                            delete(StudentProfile).where(StudentProfile.user_id.in_(user_ids))
                        )
                        await session.execute(
                            delete(UserRole).where(UserRole.user_id.in_(user_ids))
                        )
                        await session.execute(delete(User).where(User.id.in_(user_ids)))
                    await session.execute(
                        delete(Class).where(Class.code.in_(["CLOUD-2501", "AIGC-2501"]))
                    )
            await engine.dispose()

    asyncio.run(exercise_api_flow())
