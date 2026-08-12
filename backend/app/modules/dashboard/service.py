from datetime import datetime
from decimal import Decimal

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceConflictError
from app.db.mixins import utc_now
from app.modules.attempts.enums import (
    AttemptGradingStatus,
    ExamAttemptStatus,
)
from app.modules.attempts.models import ExamAttempt
from app.modules.auth.permissions import effective_role_codes
from app.modules.classes.models import Class
from app.modules.dashboard.schemas import (
    AdminDashboardData,
    AdminDashboardStats,
    DashboardExamTarget,
    DashboardRecentExam,
    PendingGradingExam,
    StudentDashboardData,
    StudentDashboardExam,
    StudentDashboardStats,
    StudentOrganizationSummary,
    StudentRecentResult,
    TeacherDashboardData,
    TeacherDashboardStats,
)
from app.modules.exams.enums import (
    ExamRuntimeStatus,
    ExamStatus,
    ExamTargetType,
    calculate_runtime_status,
)
from app.modules.exams.models import Exam, ExamTarget
from app.modules.majors.models import Major
from app.modules.papers.models import Paper
from app.modules.questions.models import Question
from app.modules.roles.models import Role, UserRole
from app.modules.students.models import StudentProfile
from app.modules.users.models import User

RECENT_LIMIT = 5
FORMAL_EXAM_STATUSES = (ExamStatus.PUBLISHED, ExamStatus.FINISHED)


async def _count(session: AsyncSession, model: type[object], *filters: object) -> int:
    statement = select(func.count()).select_from(model)
    if filters:
        statement = statement.where(*filters)
    return int(await session.scalar(statement) or 0)


async def _role_user_count(session: AsyncSession, role_code: str) -> int:
    value = await session.scalar(
        select(func.count(func.distinct(UserRole.user_id)))
        .select_from(UserRole)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.code == role_code)
    )
    return int(value or 0)


def _runtime_filter(now: datetime) -> tuple[object, ...]:
    return (
        Exam.status == ExamStatus.PUBLISHED,
        Exam.start_time <= now,
        Exam.end_time > now,
    )


async def _target_names(
    session: AsyncSession,
    targets: list[ExamTarget | None],
) -> tuple[dict[int, str], dict[int, str]]:
    major_ids = {
        target.target_id
        for target in targets
        if target is not None
        and target.target_type == ExamTargetType.MAJOR
        and target.target_id is not None
    }
    class_ids = {
        target.target_id
        for target in targets
        if target is not None
        and target.target_type == ExamTargetType.CLASS
        and target.target_id is not None
    }
    major_names = (
        dict(
            (
                await session.execute(
                    select(Major.id, Major.name).where(Major.id.in_(major_ids))
                )
            ).all()
        )
        if major_ids
        else {}
    )
    class_names = (
        dict(
            (
                await session.execute(
                    select(Class.id, Class.name).where(Class.id.in_(class_ids))
                )
            ).all()
        )
        if class_ids
        else {}
    )
    return major_names, class_names


def _target_summary(
    target: ExamTarget | None,
    major_names: dict[int, str],
    class_names: dict[int, str],
) -> DashboardExamTarget:
    if target is None:
        return DashboardExamTarget(type=None, id=None, name="未设置")
    if target.target_type == ExamTargetType.ALL:
        name = "全部学生"
    elif target.target_type == ExamTargetType.MAJOR:
        name = major_names.get(target.target_id or 0, "未知专业")
    else:
        name = class_names.get(target.target_id or 0, "未知班级")
    return DashboardExamTarget(
        type=target.target_type,
        id=target.target_id,
        name=name,
    )


async def _recent_managed_exams(
    session: AsyncSession,
    *,
    now: datetime,
    created_by: int | None,
) -> list[DashboardRecentExam]:
    filters = [] if created_by is None else [Exam.created_by == created_by]
    rows = (
        await session.execute(
            select(Exam, User, ExamTarget)
            .join(User, User.id == Exam.created_by)
            .outerjoin(ExamTarget, ExamTarget.exam_id == Exam.id)
            .where(*filters)
            .order_by(
                func.coalesce(Exam.published_at, Exam.created_at).desc(),
                Exam.id.desc(),
            )
            .limit(RECENT_LIMIT)
        )
    ).all()
    major_names, class_names = await _target_names(
        session,
        [target for _, _, target in rows],
    )
    return [
        DashboardRecentExam(
            exam_id=exam.id,
            exam_name=exam.name,
            runtime_status=calculate_runtime_status(
                exam.status,
                exam.start_time,
                exam.end_time,
                now=now,
            ),
            start_time=exam.start_time,
            end_time=exam.end_time,
            creator_name=creator.real_name,
            target=_target_summary(target, major_names, class_names),
        )
        for exam, creator, target in rows
    ]


async def _admin_dashboard(
    session: AsyncSession,
    *,
    now: datetime,
) -> AdminDashboardData:
    # Inventory totals intentionally include active and disabled records.
    stats = AdminDashboardStats(
        user_count=await _count(session, User),
        teacher_count=await _role_user_count(session, "teacher"),
        student_count=await _role_user_count(session, "student"),
        major_count=await _count(session, Major),
        class_count=await _count(session, Class),
        question_count=await _count(session, Question),
        paper_count=await _count(session, Paper),
        exam_count=await _count(session, Exam),
        in_progress_exam_count=await _count(
            session,
            Exam,
            *_runtime_filter(now),
        ),
        pending_grading_count=await _count(
            session,
            ExamAttempt,
            ExamAttempt.grading_status
            == AttemptGradingStatus.PENDING_MANUAL_GRADING,
        ),
    )
    return AdminDashboardData(
        stats=stats,
        recent_exams=await _recent_managed_exams(
            session,
            now=now,
            created_by=None,
        ),
    )


async def _pending_grading_by_exam(
    session: AsyncSession,
    *,
    teacher_user_id: int,
) -> list[PendingGradingExam]:
    rows = (
        await session.execute(
            select(
                Exam.id,
                Exam.name,
                func.count(ExamAttempt.id).label("pending_count"),
            )
            .join(ExamAttempt, ExamAttempt.exam_id == Exam.id)
            .where(
                Exam.created_by == teacher_user_id,
                ExamAttempt.grading_status
                == AttemptGradingStatus.PENDING_MANUAL_GRADING,
            )
            .group_by(Exam.id, Exam.name)
            .order_by(func.count(ExamAttempt.id).desc(), Exam.id.desc())
            .limit(RECENT_LIMIT)
        )
    ).all()
    return [
        PendingGradingExam(
            exam_id=exam_id,
            exam_name=exam_name,
            pending_attempt_count=int(pending_count),
        )
        for exam_id, exam_name, pending_count in rows
    ]


async def _teacher_dashboard(
    session: AsyncSession,
    current_user: User,
    *,
    now: datetime,
) -> TeacherDashboardData:
    owner_filter = Exam.created_by == current_user.id
    stats = TeacherDashboardStats(
        question_count=await _count(
            session,
            Question,
            Question.created_by == current_user.id,
        ),
        paper_count=await _count(
            session,
            Paper,
            Paper.created_by == current_user.id,
        ),
        exam_count=await _count(session, Exam, owner_filter),
        in_progress_exam_count=await _count(
            session,
            Exam,
            owner_filter,
            *_runtime_filter(now),
        ),
        pending_grading_count=int(
            await session.scalar(
                select(func.count())
                .select_from(ExamAttempt)
                .join(Exam, Exam.id == ExamAttempt.exam_id)
                .where(
                    owner_filter,
                    ExamAttempt.grading_status
                    == AttemptGradingStatus.PENDING_MANUAL_GRADING,
                )
            )
            or 0
        ),
    )
    return TeacherDashboardData(
        stats=stats,
        recent_exams=await _recent_managed_exams(
            session,
            now=now,
            created_by=current_user.id,
        ),
        pending_grading=await _pending_grading_by_exam(
            session,
            teacher_user_id=current_user.id,
        ),
    )


async def _student_context(
    session: AsyncSession,
    current_user: User,
) -> tuple[StudentProfile, Class, Major]:
    row = (
        await session.execute(
            select(StudentProfile, Class, Major)
            .join(Class, Class.id == StudentProfile.class_id)
            .join(Major, Major.id == Class.major_id)
            .where(StudentProfile.user_id == current_user.id)
        )
    ).first()
    if row is None:
        raise ResourceConflictError("当前账号未配置学生档案")
    return row


def _student_target_filter(
    *,
    class_id: int,
    major_id: int,
) -> object:
    return or_(
        and_(
            ExamTarget.target_type == ExamTargetType.ALL,
            ExamTarget.target_id.is_(None),
        ),
        and_(
            ExamTarget.target_type == ExamTargetType.MAJOR,
            ExamTarget.target_id == major_id,
        ),
        and_(
            ExamTarget.target_type == ExamTargetType.CLASS,
            ExamTarget.target_id == class_id,
        ),
    )


def _student_action(
    *,
    runtime_status: ExamRuntimeStatus,
    attempt: ExamAttempt | None,
) -> str:
    if attempt is not None:
        if attempt.status == ExamAttemptStatus.IN_PROGRESS:
            return "continue"
        if (
            attempt.grading_status == AttemptGradingStatus.GRADED
            and attempt.score is not None
        ):
            return "view_result"
        return "unavailable"
    if runtime_status == ExamRuntimeStatus.IN_PROGRESS:
        return "start"
    return "unavailable"


async def _student_dashboard(
    session: AsyncSession,
    current_user: User,
    *,
    now: datetime,
) -> StudentDashboardData:
    profile, student_class, major = await _student_context(session, current_user)
    target_filter = _student_target_filter(
        class_id=profile.class_id,
        major_id=major.id,
    )
    eligibility = (
        Exam.status.in_(FORMAL_EXAM_STATUSES),
        target_filter,
    )
    stats_row = (
        await session.execute(
            select(
                func.count(
                    func.distinct(
                        case(
                            (
                                and_(
                                    ExamAttempt.id.is_(None),
                                    Exam.end_time > now,
                                ),
                                Exam.id,
                            )
                        )
                    )
                ),
                func.count(
                    func.distinct(
                        case(
                            (
                                ExamAttempt.status
                                == ExamAttemptStatus.IN_PROGRESS,
                                Exam.id,
                            )
                        )
                    )
                ),
                func.count(
                    func.distinct(
                        case(
                            (
                                ExamAttempt.status == ExamAttemptStatus.SUBMITTED,
                                Exam.id,
                            )
                        )
                    )
                ),
                func.count(
                    func.distinct(
                        case(
                            (
                                and_(
                                    ExamAttempt.grading_status
                                    == AttemptGradingStatus.GRADED,
                                    ExamAttempt.score.is_not(None),
                                ),
                                Exam.id,
                            )
                        )
                    )
                ),
            )
            .select_from(Exam)
            .join(ExamTarget, ExamTarget.exam_id == Exam.id)
            .outerjoin(
                ExamAttempt,
                and_(
                    ExamAttempt.exam_id == Exam.id,
                    ExamAttempt.student_user_id == current_user.id,
                ),
            )
            .where(*eligibility)
        )
    ).one()
    average_score = await session.scalar(
        select(func.avg(ExamAttempt.score)).where(
            ExamAttempt.student_user_id == current_user.id,
            ExamAttempt.grading_status == AttemptGradingStatus.GRADED,
            ExamAttempt.score.is_not(None),
        )
    )
    exam_rows = (
        await session.execute(
            select(Exam, ExamAttempt)
            .join(ExamTarget, ExamTarget.exam_id == Exam.id)
            .outerjoin(
                ExamAttempt,
                and_(
                    ExamAttempt.exam_id == Exam.id,
                    ExamAttempt.student_user_id == current_user.id,
                ),
            )
            .where(*eligibility)
            .order_by(Exam.start_time.desc(), Exam.id.desc())
            .limit(RECENT_LIMIT)
        )
    ).all()
    recent_exams: list[StudentDashboardExam] = []
    for exam, attempt in exam_rows:
        runtime_status = calculate_runtime_status(
            exam.status,
            exam.start_time,
            exam.end_time,
            now=now,
        )
        recent_exams.append(
            StudentDashboardExam(
                exam_id=exam.id,
                exam_name=exam.name,
                runtime_status=runtime_status,
                start_time=exam.start_time,
                end_time=exam.end_time,
                deadline_at=attempt.deadline_at if attempt is not None else None,
                attempt_id=attempt.id if attempt is not None else None,
                attempt_status=attempt.status if attempt is not None else None,
                grading_status=(
                    attempt.grading_status if attempt is not None else None
                ),
                action_type=_student_action(
                    runtime_status=runtime_status,
                    attempt=attempt,
                ),
            )
        )
    result_rows = (
        await session.execute(
            select(ExamAttempt, Exam)
            .join(Exam, Exam.id == ExamAttempt.exam_id)
            .where(
                ExamAttempt.student_user_id == current_user.id,
                ExamAttempt.status == ExamAttemptStatus.SUBMITTED,
                ExamAttempt.submitted_at.is_not(None),
            )
            .order_by(ExamAttempt.submitted_at.desc(), ExamAttempt.id.desc())
            .limit(RECENT_LIMIT)
        )
    ).all()
    recent_results = [
        StudentRecentResult(
            attempt_id=attempt.id,
            exam_id=exam.id,
            exam_name=exam.name,
            total_score=exam.total_score,
            score=attempt.score,
            is_passed=attempt.is_passed,
            grading_status=attempt.grading_status,
            submitted_at=attempt.submitted_at,
        )
        for attempt, exam in result_rows
        if attempt.submitted_at is not None
    ]
    normalized_average = (
        Decimal(average_score).quantize(Decimal("0.01"))
        if average_score is not None
        else None
    )
    return StudentDashboardData(
        organization=StudentOrganizationSummary(
            major_name=major.name,
            class_name=student_class.name,
        ),
        stats=StudentDashboardStats(
            pending_exam_count=int(stats_row[0] or 0),
            in_progress_exam_count=int(stats_row[1] or 0),
            completed_exam_count=int(stats_row[2] or 0),
            graded_exam_count=int(stats_row[3] or 0),
            average_score=normalized_average,
        ),
        recent_exams=recent_exams,
        recent_results=recent_results,
    )


async def get_dashboard(
    session: AsyncSession,
    current_user: User,
    *,
    now: datetime | None = None,
) -> AdminDashboardData | TeacherDashboardData | StudentDashboardData:
    current_time = now or utc_now()
    roles = effective_role_codes(current_user)
    if "admin" in roles:
        return await _admin_dashboard(session, now=current_time)
    if "teacher" in roles:
        return await _teacher_dashboard(
            session,
            current_user,
            now=current_time,
        )
    if "student" in roles:
        return await _student_dashboard(
            session,
            current_user,
            now=current_time,
        )
    raise ResourceConflictError("当前账号未配置可用角色")
