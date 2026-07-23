import asyncio
import os

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.db.enums import RecordStatus
from app.db.models import Class, Major, Role, StudentProfile, User, UserRole
from app.db.session import AsyncSessionFactory, engine
from app.modules.auth.security import verify_password
from app.scripts.seed import InitialAdminCredentials, seed_reference_data

RUN_MYSQL_TESTS = os.getenv("RUN_MYSQL_TESTS") == "1"


@pytest.mark.skipif(not RUN_MYSQL_TESTS, reason="set RUN_MYSQL_TESTS=1 for MySQL integration")
def test_mysql_orm_relationships() -> None:
    async def exercise_relationships() -> None:
        try:
            async with AsyncSessionFactory() as session:
                try:
                    role = await session.scalar(select(Role).where(Role.code == "student"))
                    assert role is not None

                    major = Major(
                        code="ORM_TEST",
                        name="ORM关系测试专业",
                        status=RecordStatus.ACTIVE,
                    )
                    student_class = Class(
                        major=major,
                        name="ORM关系测试班",
                        code="ORM-TEST-CLASS",
                        enrollment_year=2026,
                        status=RecordStatus.ACTIVE,
                    )
                    user = User(
                        username="orm_relationship_test",
                        password_hash="$2b$12$integration-test-hash",
                        real_name="ORM关系测试",
                        status=RecordStatus.ACTIVE,
                    )
                    user.role_assignments.append(UserRole(role=role))
                    user.student_profile = StudentProfile(
                        student_no="ORM-TEST-001",
                        student_class=student_class,
                    )
                    session.add(user)
                    await session.flush()
                    user_id = user.id
                    session.expunge_all()

                    query = (
                        select(User)
                        .where(User.id == user_id)
                        .options(
                            selectinload(User.roles),
                            selectinload(User.student_profile)
                            .selectinload(StudentProfile.student_class)
                            .selectinload(Class.major),
                        )
                    )
                    loaded_user = await session.scalar(query)

                    assert loaded_user is not None
                    assert [item.code for item in loaded_user.roles] == ["student"]
                    assert loaded_user.student_profile is not None
                    assert loaded_user.student_profile.student_class.major.code == "ORM_TEST"
                finally:
                    await session.rollback()
        finally:
            await engine.dispose()

    asyncio.run(exercise_relationships())


@pytest.mark.skipif(not RUN_MYSQL_TESTS, reason="set RUN_MYSQL_TESTS=1 for MySQL integration")
def test_seed_admin_is_idempotent_and_has_admin_role() -> None:
    async def exercise_admin_seed() -> None:
        credentials = InitialAdminCredentials(
            username="seed_admin_integration",
            password="Seed-Admin-Integration!",
        )
        try:
            async with AsyncSessionFactory() as session:
                try:
                    first_summary = await seed_reference_data(
                        session,
                        initial_admin=credentials,
                    )
                    second_summary = await seed_reference_data(
                        session,
                        initial_admin=credentials,
                    )

                    query = (
                        select(User)
                        .where(User.username == credentials.username)
                        .options(selectinload(User.roles))
                        .execution_options(populate_existing=True)
                    )
                    admin = await session.scalar(query)
                    user_count = await session.scalar(
                        select(func.count())
                        .select_from(User)
                        .where(User.username == credentials.username)
                    )

                    assert first_summary.admin_created is True
                    assert second_summary.admin_created is False
                    assert second_summary.admin_existing is True
                    assert user_count == 1
                    assert admin is not None
                    assert verify_password(credentials.password, admin.password_hash) is True
                    assert [role.code for role in admin.roles] == ["admin"]
                finally:
                    await session.rollback()
        finally:
            await engine.dispose()

    asyncio.run(exercise_admin_seed())
