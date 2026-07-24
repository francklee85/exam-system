from datetime import datetime
from decimal import Decimal

from sqlalchemy import and_, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from sqlalchemy.sql import Select
from sqlalchemy.sql.elements import ColumnElement

from app.core.exceptions import (
    InvalidRequestError,
    ResourceConflictError,
    ResourceNotFoundError,
)
from app.db.mixins import utc_now
from app.modules.attempts.enums import (
    AnswerGradingStatus,
    AttemptGradingStatus,
    ExamAttemptStatus,
    SubmitReason,
)
from app.modules.attempts.models import ExamAnswer, ExamAttempt
from app.modules.attempts.service import finalize_attempt
from app.modules.auth.permissions import effective_role_codes
from app.modules.exams.models import Exam, ExamQuestion
from app.modules.questions.enums import MANUAL_GRADED_QUESTION_TYPES
from app.modules.results.schemas import (
    ExamResultItem,
    ExamResultSummary,
    GradingAttemptDetail,
    GradingTaskItem,
    ManualGradingAnswer,
    MyResultDetail,
    MyResultItem,
)
from app.modules.students.models import StudentProfile
from app.modules.users.models import User

ZERO_SCORE = Decimal("0.00")


def _is_admin(user: User) -> bool:
    return "admin" in effective_role_codes(user)


def _teacher_scope(user: User) -> bool | ColumnElement[bool]:
    return True if _is_admin(user) else Exam.created_by == user.id


async def _finalize_expired_student_attempts(
    session: AsyncSession,
    student_user_id: int,
    *,
    now: datetime,
) -> None:
    attempts = list(
        await session.scalars(
            select(ExamAttempt)
            .where(
                ExamAttempt.student_user_id == student_user_id,
                ExamAttempt.status == ExamAttemptStatus.IN_PROGRESS,
                ExamAttempt.deadline_at <= now,
            )
            .options(joinedload(ExamAttempt.exam))
            .with_for_update()
        )
    )
    if not attempts:
        return
    for attempt in attempts:
        await finalize_attempt(
            session,
            attempt,
            submit_reason=SubmitReason.TIMEOUT,
            now=now,
        )
    await session.commit()


async def _finalize_expired_managed_attempts(
    session: AsyncSession,
    current_user: User,
    *,
    exam_id: int | None = None,
    now: datetime | None = None,
) -> None:
    current_time = now or utc_now()
    filters = [
        ExamAttempt.status == ExamAttemptStatus.IN_PROGRESS,
        ExamAttempt.deadline_at <= current_time,
        _teacher_scope(current_user),
    ]
    if exam_id is not None:
        filters.append(ExamAttempt.exam_id == exam_id)
    attempts = list(
        await session.scalars(
            select(ExamAttempt)
            .join(Exam, Exam.id == ExamAttempt.exam_id)
            .where(*filters)
            .options(joinedload(ExamAttempt.exam))
            .with_for_update()
        )
    )
    if not attempts:
        return
    for attempt in attempts:
        await finalize_attempt(
            session,
            attempt,
            submit_reason=SubmitReason.TIMEOUT,
            now=current_time,
        )
    await session.commit()


def _my_result(attempt: ExamAttempt) -> MyResultItem:
    if (
        attempt.objective_score is None
        or attempt.submitted_at is None
        or attempt.submit_reason is None
    ):
        raise ResourceConflictError("考试成绩状态不完整")
    return MyResultItem(
        attempt_id=attempt.id,
        exam_id=attempt.exam_id,
        exam_name=attempt.exam.name,
        total_score=attempt.exam.total_score,
        pass_score=attempt.exam.pass_score,
        attempt_status=attempt.status,
        grading_status=attempt.grading_status,
        objective_score=attempt.objective_score,
        manual_score=attempt.manual_score,
        score=attempt.score,
        is_passed=attempt.is_passed,
        submitted_at=attempt.submitted_at,
        submit_reason=attempt.submit_reason,
    )


async def list_my_results(
    session: AsyncSession,
    current_user: User,
    *,
    page: int,
    page_size: int,
    now: datetime | None = None,
) -> tuple[list[MyResultItem], int]:
    current_time = now or utc_now()
    await _finalize_expired_student_attempts(
        session,
        current_user.id,
        now=current_time,
    )
    filters = (
        ExamAttempt.student_user_id == current_user.id,
        ExamAttempt.status == ExamAttemptStatus.SUBMITTED,
    )
    total = await session.scalar(
        select(func.count()).select_from(ExamAttempt).where(*filters)
    )
    attempts = list(
        await session.scalars(
            select(ExamAttempt)
            .where(*filters)
            .options(joinedload(ExamAttempt.exam))
            .order_by(ExamAttempt.submitted_at.desc(), ExamAttempt.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return [_my_result(attempt) for attempt in attempts], int(total or 0)


async def get_my_result(
    session: AsyncSession,
    attempt_id: int,
    current_user: User,
    *,
    now: datetime | None = None,
) -> MyResultDetail:
    current_time = now or utc_now()
    attempt = await session.scalar(
        select(ExamAttempt)
        .where(
            ExamAttempt.id == attempt_id,
            ExamAttempt.student_user_id == current_user.id,
        )
        .options(joinedload(ExamAttempt.exam))
        .with_for_update()
    )
    if attempt is None:
        raise ResourceNotFoundError("考试成绩不存在")
    if (
        attempt.status == ExamAttemptStatus.IN_PROGRESS
        and current_time >= attempt.deadline_at
    ):
        await finalize_attempt(
            session,
            attempt,
            submit_reason=SubmitReason.TIMEOUT,
            now=current_time,
        )
        await session.commit()
    if attempt.status != ExamAttemptStatus.SUBMITTED:
        raise ResourceConflictError("考试尚未交卷")
    item = _my_result(attempt)
    return MyResultDetail(
        **item.model_dump(),
        started_at=attempt.started_at,
        deadline_at=attempt.deadline_at,
    )


def _grading_attempt_statement(
    attempt_id: int,
    current_user: User,
) -> Select[tuple[ExamAttempt]]:
    return (
        select(ExamAttempt)
        .join(Exam, Exam.id == ExamAttempt.exam_id)
        .where(
            ExamAttempt.id == attempt_id,
            _teacher_scope(current_user),
        )
        .options(
            joinedload(ExamAttempt.exam),
            joinedload(ExamAttempt.student)
            .joinedload(User.student_profile)
            .joinedload(StudentProfile.student_class),
        )
    )


async def _get_grading_attempt(
    session: AsyncSession,
    attempt_id: int,
    current_user: User,
    *,
    for_update: bool = False,
) -> ExamAttempt:
    statement = _grading_attempt_statement(attempt_id, current_user)
    if for_update:
        statement = statement.with_for_update()
    attempt = await session.scalar(statement)
    if attempt is None:
        raise ResourceNotFoundError("阅卷任务不存在")
    if attempt.status != ExamAttemptStatus.SUBMITTED:
        raise ResourceConflictError("考试尚未交卷")
    return attempt


async def _manual_rows(
    session: AsyncSession,
    attempt: ExamAttempt,
) -> list[tuple[ExamQuestion, ExamAnswer | None]]:
    return (
        await session.execute(
            select(ExamQuestion, ExamAnswer)
            .outerjoin(
                ExamAnswer,
                and_(
                    ExamAnswer.exam_question_id == ExamQuestion.id,
                    ExamAnswer.attempt_id == attempt.id,
                ),
            )
            .where(
                ExamQuestion.exam_id == attempt.exam_id,
                ExamQuestion.question_type.in_(MANUAL_GRADED_QUESTION_TYPES),
            )
            .order_by(ExamQuestion.sort_order)
        )
    ).all()


def _student_details(attempt: ExamAttempt) -> tuple[str, str]:
    profile = attempt.student.student_profile
    if profile is None:
        return "", ""
    return profile.student_no, profile.student_class.name


async def list_grading_tasks(
    session: AsyncSession,
    current_user: User,
    *,
    page: int,
    page_size: int,
    exam_id: int | None,
    grading_status: AttemptGradingStatus | None,
) -> tuple[list[GradingTaskItem], int]:
    await _finalize_expired_managed_attempts(session, current_user)
    filters = [
        ExamAttempt.status == ExamAttemptStatus.SUBMITTED,
        ExamAttempt.grading_status.in_(
            (
                AttemptGradingStatus.PENDING_MANUAL_GRADING,
                AttemptGradingStatus.GRADED,
            )
        ),
        _teacher_scope(current_user),
        exists(
            select(ExamQuestion.id).where(
                ExamQuestion.exam_id == ExamAttempt.exam_id,
                ExamQuestion.question_type.in_(MANUAL_GRADED_QUESTION_TYPES),
            )
        ),
    ]
    if exam_id is not None:
        filters.append(ExamAttempt.exam_id == exam_id)
    if grading_status is not None:
        filters.append(ExamAttempt.grading_status == grading_status)
    total = await session.scalar(
        select(func.count())
        .select_from(ExamAttempt)
        .join(Exam, Exam.id == ExamAttempt.exam_id)
        .where(*filters)
    )
    pending_count = (
        select(func.count(ExamAnswer.id))
        .where(
            ExamAnswer.attempt_id == ExamAttempt.id,
            ExamAnswer.grading_status != AnswerGradingStatus.GRADED,
        )
        .correlate(ExamAttempt)
        .scalar_subquery()
    )
    rows = (
        await session.execute(
            select(ExamAttempt, pending_count)
            .join(Exam, Exam.id == ExamAttempt.exam_id)
            .where(*filters)
            .options(
                joinedload(ExamAttempt.exam),
                joinedload(ExamAttempt.student)
                .joinedload(User.student_profile)
                .joinedload(StudentProfile.student_class),
            )
            .order_by(ExamAttempt.submitted_at.desc(), ExamAttempt.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items: list[GradingTaskItem] = []
    for attempt, pending in rows:
        student_no, class_name = _student_details(attempt)
        items.append(
            GradingTaskItem(
                attempt_id=attempt.id,
                exam_id=attempt.exam_id,
                exam_name=attempt.exam.name,
                student_user_id=attempt.student_user_id,
                student_no=student_no,
                student_name=attempt.student.real_name,
                class_name=class_name,
                objective_score=attempt.objective_score or ZERO_SCORE,
                manual_score=attempt.manual_score,
                score=attempt.score,
                grading_status=attempt.grading_status,
                pending_manual_count=pending,
                submitted_at=attempt.submitted_at,
            )
        )
    return items, int(total or 0)


async def get_grading_detail(
    session: AsyncSession,
    attempt_id: int,
    current_user: User,
) -> GradingAttemptDetail:
    attempt = await _get_grading_attempt(session, attempt_id, current_user)
    rows = await _manual_rows(session, attempt)
    if not rows:
        raise ResourceConflictError("该考试没有人工阅卷题")
    student_no, class_name = _student_details(attempt)
    return GradingAttemptDetail(
        attempt_id=attempt.id,
        exam_id=attempt.exam_id,
        exam_name=attempt.exam.name,
        student_user_id=attempt.student_user_id,
        student_no=student_no,
        student_name=attempt.student.real_name,
        class_name=class_name,
        objective_score=attempt.objective_score or ZERO_SCORE,
        manual_score=attempt.manual_score,
        score=attempt.score,
        is_passed=attempt.is_passed,
        grading_status=attempt.grading_status,
        submitted_at=attempt.submitted_at,
        answers=[
            ManualGradingAnswer(
                exam_question_id=snapshot.id,
                sort_order=snapshot.sort_order,
                question_type=snapshot.question_type,
                content=snapshot.content,
                reference_answer=snapshot.reference_answer,
                analysis=snapshot.analysis,
                full_score=snapshot.score,
                student_answer=answer.answer if answer else None,
                score_awarded=answer.score_awarded if answer else None,
                grading_status=(
                    answer.grading_status
                    if answer
                    else AnswerGradingStatus.PENDING
                ),
                grading_comment=answer.grading_comment if answer else None,
                grader_id=answer.grader_id if answer else None,
                graded_at=answer.graded_at if answer else None,
            )
            for snapshot, answer in rows
        ],
    )


async def _recalculate_manual_result(
    session: AsyncSession,
    attempt: ExamAttempt,
) -> None:
    rows = await _manual_rows(session, attempt)
    if not rows:
        attempt.manual_score = ZERO_SCORE
        attempt.score = attempt.objective_score or ZERO_SCORE
        attempt.is_passed = attempt.score >= attempt.exam.pass_score
        attempt.grading_status = AttemptGradingStatus.GRADED
        return
    if any(
        answer is None or answer.grading_status != AnswerGradingStatus.GRADED
        for _, answer in rows
    ):
        attempt.grading_status = AttemptGradingStatus.PENDING_MANUAL_GRADING
        attempt.manual_score = None
        attempt.score = None
        attempt.is_passed = None
        return
    manual_score = sum(
        (answer.score_awarded or ZERO_SCORE for _, answer in rows if answer),
        ZERO_SCORE,
    )
    attempt.manual_score = manual_score
    attempt.score = (attempt.objective_score or ZERO_SCORE) + manual_score
    attempt.is_passed = attempt.score >= attempt.exam.pass_score
    attempt.grading_status = AttemptGradingStatus.GRADED


async def grade_manual_answer(
    session: AsyncSession,
    attempt_id: int,
    exam_question_id: int,
    *,
    score_awarded: Decimal,
    grading_comment: str | None,
    current_user: User,
    now: datetime | None = None,
) -> GradingAttemptDetail:
    current_time = now or utc_now()
    attempt = await _get_grading_attempt(
        session,
        attempt_id,
        current_user,
        for_update=True,
    )
    snapshot = await session.scalar(
        select(ExamQuestion).where(
            ExamQuestion.id == exam_question_id,
            ExamQuestion.exam_id == attempt.exam_id,
            ExamQuestion.question_type.in_(MANUAL_GRADED_QUESTION_TYPES),
        )
    )
    if snapshot is None:
        raise ResourceNotFoundError("人工阅卷题不存在")
    if score_awarded > snapshot.score:
        raise InvalidRequestError("人工评分不能超过题目满分")
    answer = await session.scalar(
        select(ExamAnswer).where(
            ExamAnswer.attempt_id == attempt.id,
            ExamAnswer.exam_question_id == snapshot.id,
        )
    )
    if answer is None:
        answer = ExamAnswer(
            attempt_id=attempt.id,
            exam_question_id=snapshot.id,
            answer=None,
        )
        session.add(answer)
    answer.is_correct = None
    answer.score_awarded = score_awarded
    answer.grading_status = AnswerGradingStatus.GRADED
    answer.grader_id = current_user.id
    answer.grading_comment = (
        grading_comment.strip() if grading_comment and grading_comment.strip() else None
    )
    answer.graded_at = current_time
    await session.flush()
    await _recalculate_manual_result(session, attempt)
    await session.commit()
    return await get_grading_detail(session, attempt.id, current_user)


async def _get_owned_exam(
    session: AsyncSession,
    exam_id: int,
    current_user: User,
) -> Exam:
    exam = await session.scalar(
        select(Exam).where(Exam.id == exam_id, _teacher_scope(current_user))
    )
    if exam is None:
        raise ResourceNotFoundError("考试不存在")
    return exam


async def list_exam_results(
    session: AsyncSession,
    exam_id: int,
    current_user: User,
    *,
    page: int,
    page_size: int,
    keyword: str | None,
    grading_status: AttemptGradingStatus | None,
) -> tuple[list[ExamResultItem], int, ExamResultSummary]:
    await _get_owned_exam(session, exam_id, current_user)
    await _finalize_expired_managed_attempts(
        session,
        current_user,
        exam_id=exam_id,
    )
    filters = [ExamAttempt.exam_id == exam_id]
    if grading_status is not None:
        filters.append(ExamAttempt.grading_status == grading_status)
    if keyword and keyword.strip():
        term = f"%{keyword.strip()}%"
        filters.append(
            (User.real_name.like(term)) | (StudentProfile.student_no.like(term))
        )
    base = (
        select(ExamAttempt)
        .join(User, User.id == ExamAttempt.student_user_id)
        .join(StudentProfile, StudentProfile.user_id == User.id)
        .where(*filters)
    )
    total = await session.scalar(
        select(func.count())
        .select_from(ExamAttempt)
        .join(User, User.id == ExamAttempt.student_user_id)
        .join(StudentProfile, StudentProfile.user_id == User.id)
        .where(*filters)
    )
    attempts = list(
        await session.scalars(
            base.options(
                joinedload(ExamAttempt.student)
                .joinedload(User.student_profile)
                .joinedload(StudentProfile.student_class)
            )
            .order_by(ExamAttempt.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    all_attempts = list(
        await session.scalars(
            select(ExamAttempt).where(ExamAttempt.exam_id == exam_id)
        )
    )
    summary = ExamResultSummary(
        attempted_count=len(all_attempts),
        submitted_count=sum(
            item.status == ExamAttemptStatus.SUBMITTED for item in all_attempts
        ),
        pending_manual_count=sum(
            item.grading_status == AttemptGradingStatus.PENDING_MANUAL_GRADING
            for item in all_attempts
        ),
        graded_count=sum(
            item.grading_status == AttemptGradingStatus.GRADED
            for item in all_attempts
        ),
        passed_count=sum(item.is_passed is True for item in all_attempts),
    )
    items = []
    for attempt in attempts:
        student_no, class_name = _student_details(attempt)
        items.append(
            ExamResultItem(
                attempt_id=attempt.id,
                student_user_id=attempt.student_user_id,
                student_no=student_no,
                student_name=attempt.student.real_name,
                class_name=class_name,
                attempt_status=attempt.status,
                grading_status=attempt.grading_status,
                objective_score=attempt.objective_score,
                manual_score=attempt.manual_score,
                final_score=attempt.score,
                is_passed=attempt.is_passed,
                submitted_at=attempt.submitted_at,
                submit_reason=attempt.submit_reason,
            )
        )
    return items, int(total or 0), summary
