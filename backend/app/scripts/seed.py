import asyncio
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.db.enums import RecordStatus
from app.db.models import Major, Role, User, UserRole
from app.db.session import AsyncSessionFactory, engine
from app.modules.auth.security import hash_password


@dataclass(frozen=True, slots=True)
class ReferenceItem:
    code: str
    name: str


@dataclass(frozen=True, slots=True)
class InitialAdminCredentials:
    username: str
    password: str = field(repr=False)


@dataclass(frozen=True, slots=True)
class SeedSummary:
    roles_created: int
    roles_existing: int
    majors_created: int
    majors_existing: int
    admin_created: bool
    admin_existing: bool
    admin_role_assigned: bool
    admin_skipped: bool


DEFAULT_ROLES = (
    ReferenceItem(code="admin", name="管理员"),
    ReferenceItem(code="teacher", name="教师"),
    ReferenceItem(code="student", name="学生"),
)

DEFAULT_MAJORS = (
    ReferenceItem(code="CLOUD", name="云计算"),
    ReferenceItem(code="AI_MEDIA", name="AI数媒"),
    ReferenceItem(code="AIGC", name="AIGC"),
    ReferenceItem(code="NETOPS", name="网络运维"),
)


async def seed_reference_data(
    session: AsyncSession,
    *,
    initial_admin: InitialAdminCredentials | None = None,
) -> SeedSummary:
    """Create or normalize required reference rows without relying on fixed IDs."""
    role_codes = [item.code for item in DEFAULT_ROLES]
    roles = await session.scalars(select(Role).where(Role.code.in_(role_codes)))
    roles_by_code = {role.code: role for role in roles}

    roles_created = 0
    for item in DEFAULT_ROLES:
        role = roles_by_code.get(item.code)
        if role is None:
            role = Role(
                code=item.code,
                name=item.name,
                status=RecordStatus.ACTIVE,
            )
            session.add(role)
            roles_by_code[item.code] = role
            roles_created += 1
        else:
            role.name = item.name
            role.status = RecordStatus.ACTIVE

    major_codes = [item.code for item in DEFAULT_MAJORS]
    majors = await session.scalars(select(Major).where(Major.code.in_(major_codes)))
    majors_by_code = {major.code: major for major in majors}

    majors_created = 0
    for item in DEFAULT_MAJORS:
        major = majors_by_code.get(item.code)
        if major is None:
            session.add(
                Major(
                    code=item.code,
                    name=item.name,
                    status=RecordStatus.ACTIVE,
                )
            )
            majors_created += 1
        else:
            major.name = item.name
            major.status = RecordStatus.ACTIVE

    await session.flush()

    admin_created = False
    admin_existing = False
    admin_role_assigned = False
    if initial_admin is not None:
        admin_query = (
            select(User)
            .where(User.username == initial_admin.username)
            .options(selectinload(User.role_assignments))
        )
        admin = await session.scalar(admin_query)
        admin_role = roles_by_code["admin"]

        if admin is None:
            admin = User(
                username=initial_admin.username,
                password_hash=hash_password(initial_admin.password),
                real_name="系统管理员",
                status=RecordStatus.ACTIVE,
            )
            admin.role_assignments.append(UserRole(role=admin_role))
            session.add(admin)
            admin_created = True
            admin_role_assigned = True
        else:
            admin_existing = True
            has_admin_role = any(
                assignment.role_id == admin_role.id for assignment in admin.role_assignments
            )
            if not has_admin_role:
                admin.role_assignments.append(UserRole(role=admin_role))
                admin_role_assigned = True

        await session.flush()

    return SeedSummary(
        roles_created=roles_created,
        roles_existing=len(DEFAULT_ROLES) - roles_created,
        majors_created=majors_created,
        majors_existing=len(DEFAULT_MAJORS) - majors_created,
        admin_created=admin_created,
        admin_existing=admin_existing,
        admin_role_assigned=admin_role_assigned,
        admin_skipped=initial_admin is None,
    )


async def run_seed() -> SeedSummary:
    settings = get_settings()
    initial_admin = None
    if settings.initial_admin_username is not None and settings.initial_admin_password is not None:
        initial_admin = InitialAdminCredentials(
            username=settings.initial_admin_username,
            password=settings.initial_admin_password.get_secret_value(),
        )

    async with AsyncSessionFactory.begin() as session:
        return await seed_reference_data(session, initial_admin=initial_admin)


async def main() -> None:
    try:
        summary = await run_seed()
        print(
            "Seed completed: "
            f"roles={summary.roles_created} created/{summary.roles_existing} existing, "
            f"majors={summary.majors_created} created/{summary.majors_existing} existing, "
            f"admin_created={summary.admin_created}, "
            f"admin_existing={summary.admin_existing}, "
            f"admin_role_assigned={summary.admin_role_assigned}, "
            f"admin_skipped={summary.admin_skipped}"
        )
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
