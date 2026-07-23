import asyncio
import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.enums import RecordStatus
from app.db.models import Class, Major, Role, User, UserRole
from app.db.session import AsyncSessionFactory, engine
from app.main import app
from app.modules.auth.security import hash_password

RUN_MYSQL_ORGANIZATION_TESTS = os.getenv("RUN_MYSQL_ORGANIZATION_TESTS") == "1"
TEST_ADMIN_USERNAME = "organization_api_admin"
TEST_ADMIN_PASSWORD = "Organization-API-Test-Password!"


@pytest.mark.skipif(
    not RUN_MYSQL_ORGANIZATION_TESTS,
    reason="set RUN_MYSQL_ORGANIZATION_TESTS=1 for the dedicated MySQL API test",
)
def test_mysql_admin_major_and_class_api_flow() -> None:
    async def exercise_api_flow() -> None:
        setup_created = False
        try:
            async with AsyncSessionFactory.begin() as session:
                existing_admin_role = await session.scalar(
                    select(Role.id).where(Role.code == "admin")
                )
                existing_admin = await session.scalar(
                    select(User.id).where(User.username == TEST_ADMIN_USERNAME)
                )
                existing_major = await session.scalar(select(Major.id).where(Major.code == "CLOUD"))
                assert existing_admin_role is None
                assert existing_admin is None
                assert existing_major is None

                admin_role = Role(
                    code="admin",
                    name="管理员",
                    status=RecordStatus.ACTIVE,
                )
                admin = User(
                    username=TEST_ADMIN_USERNAME,
                    password_hash=hash_password(TEST_ADMIN_PASSWORD),
                    real_name="组织管理集成测试管理员",
                    status=RecordStatus.ACTIVE,
                )
                admin.role_assignments.append(UserRole(role=admin_role))
                session.add(admin)
            setup_created = True

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                login_response = await client.post(
                    "/api/v1/auth/login",
                    json={
                        "username": TEST_ADMIN_USERNAME,
                        "password": TEST_ADMIN_PASSWORD,
                    },
                )
                assert login_response.status_code == 200
                headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

                major_response = await client.post(
                    "/api/v1/majors",
                    headers=headers,
                    json={
                        "name": "云计算",
                        "code": "cloud",
                        "description": "云计算技术方向",
                    },
                )
                assert major_response.status_code == 201
                major = major_response.json()
                assert major["code"] == "CLOUD"

                class_response = await client.post(
                    "/api/v1/classes",
                    headers=headers,
                    json={
                        "major_id": major["id"],
                        "name": "云计算2501班",
                        "code": "cloud-2501",
                        "enrollment_year": 2025,
                        "description": "2025级云计算1班",
                    },
                )
                assert class_response.status_code == 201
                class_record = class_response.json()
                assert class_record["code"] == "CLOUD-2501"
                assert class_record["major"] == {
                    "id": major["id"],
                    "name": "云计算",
                    "code": "CLOUD",
                }

                major_detail = await client.get(
                    f"/api/v1/majors/{major['id']}",
                    headers=headers,
                )
                class_detail = await client.get(
                    f"/api/v1/classes/{class_record['id']}",
                    headers=headers,
                )
                assert major_detail.status_code == 200
                assert class_detail.status_code == 200
                assert class_detail.json()["major"]["code"] == "CLOUD"

                class_status_response = await client.patch(
                    f"/api/v1/classes/{class_record['id']}/status",
                    headers=headers,
                    json={"status": "disabled"},
                )
                major_status_response = await client.patch(
                    f"/api/v1/majors/{major['id']}/status",
                    headers=headers,
                    json={"status": "disabled"},
                )
                assert class_status_response.status_code == 200
                assert class_status_response.json()["status"] == "disabled"
                assert major_status_response.status_code == 200
                assert major_status_response.json()["status"] == "disabled"
        finally:
            if setup_created:
                async with AsyncSessionFactory.begin() as session:
                    await session.execute(delete(Class).where(Class.code == "CLOUD-2501"))
                    await session.execute(delete(Major).where(Major.code == "CLOUD"))
                    user_id = await session.scalar(
                        select(User.id).where(User.username == TEST_ADMIN_USERNAME)
                    )
                    if user_id is not None:
                        await session.execute(delete(UserRole).where(UserRole.user_id == user_id))
                        await session.execute(delete(User).where(User.id == user_id))
                    await session.execute(delete(Role).where(Role.code == "admin"))
            await engine.dispose()

    asyncio.run(exercise_api_flow())
