from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
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
from app.modules.attempts.schemas import (
    AttemptSubmissionResponse,
    ExamAttemptResponse,
    MyExamDetail,
    MyExamListItem,
    SavedAnswerResponse,
    StudentExamQuestionResponse,
)
from app.modules.classes.models import Class
from app.modules.exams.enums import (
    ExamStatus,
    ExamTargetType,
    calculate_runtime_status,
)
from app.modules.exams.models import Exam, ExamQuestion, ExamTarget
from app.modules.questions.enums import (
    AUTO_GRADED_QUESTION_TYPES,
    CHOICE_QUESTION_TYPES,
    MANUAL_GRADED_QUESTION_TYPES,
    QuestionType,
)
from app.modules.students.models import StudentProfile
from app.modules.users.models import User

MAX_MANUAL_ANSWER_LENGTH = 20_000
FORMAL_EXAM_STATUSES = (ExamStatus.PUBLISHED, ExamStatus.FINISHED)
ZERO_SCORE = Decimal("0.00")


@dataclass(frozen=True)
class StudentOrganization:
    class_id: int
    major_id: int


async def _get_student_organization(
    session: AsyncSession,
    current_user: User,
) -> StudentOrganization:
    statement = (
        select(StudentProfile)
        .where(StudentProfile.user_id == current_user.id)
        .options(
            joinedload(StudentProfile.student_class).joinedload(Class.major),
        )
    )
    profile = await session.scalar(statement)
    if profile is None:
        raise ResourceConflictError("当前账号未配置学生档案")
    return StudentOrganization(
        class_id=profile.class_id,
        major_id=profile.student_class.major_id,
    )


def _target_match_expression(
    organization: StudentOrganization,
) -> ColumnElement[bool]:
    return or_(
        and_(
            ExamTarget.target_type == ExamTargetType.ALL,
            ExamTarget.target_id.is_(None),
        ),
        and_(
            ExamTarget.target_type == ExamTargetType.MAJOR,
            ExamTarget.target_id == organization.major_id,
        ),
        and_(
            ExamTarget.target_type == ExamTargetType.CLASS,
            ExamTarget.target_id == organization.class_id,
        ),
    )


def _to_my_exam_item(
    exam: Exam,
    attempt: ExamAttempt | None,
    *,
    now: datetime,
) -> MyExamListItem:
    return MyExamListItem(
        exam_id=exam.id,
        name=exam.name,
        description=exam.description,
        start_time=exam.start_time,
        end_time=exam.end_time,
        duration_minutes=exam.duration_minutes,
        total_score=exam.total_score,
        pass_score=exam.pass_score,
        status=exam.status,
        runtime_status=calculate_runtime_status(
            exam.status,
            exam.start_time,
            exam.end_time,
            now=now,
        ),
        attempt_id=attempt.id if attempt is not None else None,
        attempt_status=attempt.status if attempt is not None else None,
        started_at=attempt.started_at if attempt is not None else None,
        deadline_at=attempt.deadline_at if attempt is not None else None,
    )


async def list_my_exams(
    session: AsyncSession,
    current_user: User,
    *,
    page: int,
    page_size: int,
    now: datetime | None = None,
) -> tuple[list[MyExamListItem], int]:
    organization = await _get_student_organization(session, current_user)
    current_time = now or utc_now()
    target_filter = _target_match_expression(organization)
    filters = (
        Exam.status.in_(FORMAL_EXAM_STATUSES),
        target_filter,
    )
    total = await session.scalar(
        select(func.count(func.distinct(Exam.id)))
        .select_from(Exam)
        .join(ExamTarget, ExamTarget.exam_id == Exam.id)
        .where(*filters)
    )
    statement = (
        select(Exam, ExamAttempt)
        .join(ExamTarget, ExamTarget.exam_id == Exam.id)
        .outerjoin(
            ExamAttempt,
            and_(
                ExamAttempt.exam_id == Exam.id,
                ExamAttempt.student_user_id == current_user.id,
            ),
        )
        .where(*filters)
        .order_by(Exam.start_time.desc(), Exam.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(statement)).all()
    return (
        [
            _to_my_exam_item(exam, attempt, now=current_time)
            for exam, attempt in rows
        ],
        int(total or 0),
    )


async def get_my_exam(
    session: AsyncSession,
    exam_id: int,
    current_user: User,
    *,
    now: datetime | None = None,
) -> MyExamDetail:
    organization = await _get_student_organization(session, current_user)
    statement = (
        select(Exam, ExamAttempt)
        .join(ExamTarget, ExamTarget.exam_id == Exam.id)
        .outerjoin(
            ExamAttempt,
            and_(
                ExamAttempt.exam_id == Exam.id,
                ExamAttempt.student_user_id == current_user.id,
            ),
        )
        .where(
            Exam.id == exam_id,
            Exam.status.in_(FORMAL_EXAM_STATUSES),
            _target_match_expression(organization),
        )
    )
    row = (await session.execute(statement)).first()
    if row is None:
        raise ResourceNotFoundError("考试不存在")
    exam, attempt = row
    item = _to_my_exam_item(exam, attempt, now=now or utc_now())
    return MyExamDetail(**item.model_dump(), published_at=exam.published_at)


async def _get_existing_attempt(
    session: AsyncSession,
    exam_id: int,
    student_user_id: int,
) -> ExamAttempt | None:
    return await session.scalar(
        select(ExamAttempt).where(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.student_user_id == student_user_id,
        )
    )


async def _get_eligible_exam_for_start(
    session: AsyncSession,
    exam_id: int,
    current_user: User,
) -> Exam:
    organization = await _get_student_organization(session, current_user)
    statement = (
        select(Exam)
        .join(ExamTarget, ExamTarget.exam_id == Exam.id)
        .where(
            Exam.id == exam_id,
            Exam.status == ExamStatus.PUBLISHED,
            _target_match_expression(organization),
        )
        .with_for_update()
    )
    exam = await session.scalar(statement)
    if exam is None:
        raise ResourceNotFoundError("考试不存在")
    return exam


async def _validate_snapshot_integrity(
    session: AsyncSession,
    exam: Exam,
) -> None:
    snapshots = list(
        await session.scalars(
            select(ExamQuestion)
            .where(ExamQuestion.exam_id == exam.id)
            .order_by(ExamQuestion.sort_order)
        )
    )
    if not snapshots:
        raise ResourceConflictError("考试题目快照不完整，无法开始考试")
    expected_orders = list(range(1, len(snapshots) + 1))
    actual_orders = [snapshot.sort_order for snapshot in snapshots]
    snapshot_total = sum(
        (snapshot.score for snapshot in snapshots),
        Decimal("0.00"),
    )
    if actual_orders != expected_orders or snapshot_total != exam.total_score:
        raise ResourceConflictError("考试题目快照不完整，无法开始考试")


async def start_exam(
    session: AsyncSession,
    exam_id: int,
    current_user: User,
    *,
    now: datetime | None = None,
) -> ExamAttemptResponse:
    current_time = now or utc_now()
    student_user_id = current_user.id
    existing = await _get_existing_attempt(session, exam_id, student_user_id)
    if existing is not None:
        return await _get_attempt_response_by_user_id(
            session,
            existing.id,
            student_user_id,
            now=current_time,
        )

    exam = await _get_eligible_exam_for_start(session, exam_id, current_user)
    if current_time < exam.start_time:
        raise ResourceConflictError("考试尚未开始")
    if current_time >= exam.end_time:
        raise ResourceConflictError("考试已结束")
    await _validate_snapshot_integrity(session, exam)

    deadline_at = min(
        current_time + timedelta(minutes=exam.duration_minutes),
        exam.end_time,
    )
    attempt = ExamAttempt(
        exam_id=exam.id,
        student_user_id=student_user_id,
        status=ExamAttemptStatus.IN_PROGRESS,
        grading_status=AttemptGradingStatus.NOT_STARTED,
        started_at=current_time,
        deadline_at=deadline_at,
        submitted_at=None,
        submit_reason=None,
        objective_score=None,
        manual_score=None,
        score=None,
        is_passed=None,
    )
    session.add(attempt)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await _get_existing_attempt(session, exam_id, student_user_id)
        if existing is None:
            raise ResourceConflictError("开始考试失败，请重试") from None
        attempt = existing

    return await _get_attempt_response_by_user_id(
        session,
        attempt.id,
        student_user_id,
        now=current_time,
    )


async def _get_owned_attempt(
    session: AsyncSession,
    attempt_id: int,
    student_user_id: int,
    *,
    for_update: bool = False,
) -> ExamAttempt:
    statement = (
        select(ExamAttempt)
        .where(
            ExamAttempt.id == attempt_id,
            ExamAttempt.student_user_id == student_user_id,
        )
        .options(joinedload(ExamAttempt.exam))
    )
    if for_update:
        statement = statement.with_for_update()
    attempt = await session.scalar(statement)
    if attempt is None:
        raise ResourceNotFoundError("考试作答记录不存在")
    return attempt


async def get_attempt_response(
    session: AsyncSession,
    attempt_id: int,
    current_user: User,
    *,
    now: datetime | None = None,
) -> ExamAttemptResponse:
    return await _get_attempt_response_by_user_id(
        session,
        attempt_id,
        current_user.id,
        now=now,
    )


async def _get_attempt_response_by_user_id(
    session: AsyncSession,
    attempt_id: int,
    student_user_id: int,
    *,
    now: datetime | None = None,
) -> ExamAttemptResponse:
    current_time = now or utc_now()
    attempt = await _get_owned_attempt(
        session,
        attempt_id,
        student_user_id,
        for_update=True,
    )
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
    statement = (
        select(ExamQuestion, ExamAnswer)
        .outerjoin(
            ExamAnswer,
            and_(
                ExamAnswer.exam_question_id == ExamQuestion.id,
                ExamAnswer.attempt_id == attempt.id,
            ),
        )
        .where(ExamQuestion.exam_id == attempt.exam_id)
        .order_by(ExamQuestion.sort_order)
    )
    rows = (await session.execute(statement)).all()
    questions = [
        StudentExamQuestionResponse.from_snapshot(
            snapshot,
            saved_answer=answer.answer if answer is not None else None,
        )
        for snapshot, answer in rows
    ]
    return ExamAttemptResponse(
        attempt_id=attempt.id,
        exam_id=attempt.exam_id,
        exam_name=attempt.exam.name,
        status=attempt.status,
        grading_status=attempt.grading_status,
        started_at=attempt.started_at,
        deadline_at=attempt.deadline_at,
        submitted_at=attempt.submitted_at,
        submit_reason=attempt.submit_reason,
        objective_score=attempt.objective_score,
        manual_score=attempt.manual_score,
        score=attempt.score,
        is_passed=attempt.is_passed,
        server_time=current_time,
        questions=questions,
    )


def _answers_match(
    student_answer: list[str] | None,
    correct_answer: list[str] | None,
) -> bool:
    if not student_answer or not correct_answer:
        return False
    return set(student_answer) == set(correct_answer)


async def finalize_attempt(
    session: AsyncSession,
    attempt: ExamAttempt,
    *,
    submit_reason: SubmitReason,
    now: datetime | None = None,
) -> ExamAttempt:
    """Finalize one attempt once, using immutable exam-question snapshots."""
    if attempt.status != ExamAttemptStatus.IN_PROGRESS:
        return attempt

    current_time = now or utc_now()
    snapshots = list(
        await session.scalars(
            select(ExamQuestion)
            .where(ExamQuestion.exam_id == attempt.exam_id)
            .order_by(ExamQuestion.sort_order)
        )
    )
    if not snapshots:
        raise ResourceConflictError("考试题目快照不完整，无法交卷")

    answers = list(
        await session.scalars(
            select(ExamAnswer).where(ExamAnswer.attempt_id == attempt.id)
        )
    )
    answers_by_question = {answer.exam_question_id: answer for answer in answers}
    objective_score = ZERO_SCORE
    has_manual_questions = False

    for snapshot in snapshots:
        answer = answers_by_question.get(snapshot.id)
        if answer is None:
            answer = ExamAnswer(
                attempt_id=attempt.id,
                exam_question_id=snapshot.id,
                answer=None,
                answered_at=None,
            )
            session.add(answer)
            answers_by_question[snapshot.id] = answer

        if snapshot.question_type in AUTO_GRADED_QUESTION_TYPES:
            is_correct = _answers_match(answer.answer, snapshot.correct_answer)
            awarded = snapshot.score if is_correct else ZERO_SCORE
            answer.is_correct = is_correct
            answer.score_awarded = awarded
            answer.grading_status = AnswerGradingStatus.GRADED
            answer.grader_id = None
            answer.grading_comment = None
            answer.graded_at = current_time
            objective_score += awarded
        elif snapshot.question_type in MANUAL_GRADED_QUESTION_TYPES:
            has_manual_questions = True
            answer.is_correct = None
            answer.score_awarded = None
            answer.grading_status = AnswerGradingStatus.PENDING
            answer.grader_id = None
            answer.grading_comment = None
            answer.graded_at = None
        else:
            raise ResourceConflictError("考试题型不受支持")

    attempt.status = ExamAttemptStatus.SUBMITTED
    attempt.submitted_at = (
        attempt.deadline_at
        if submit_reason == SubmitReason.TIMEOUT
        else current_time
    )
    attempt.submit_reason = submit_reason
    attempt.objective_score = objective_score
    if has_manual_questions:
        attempt.grading_status = AttemptGradingStatus.PENDING_MANUAL_GRADING
        attempt.manual_score = None
        attempt.score = None
        attempt.is_passed = None
    else:
        attempt.grading_status = AttemptGradingStatus.GRADED
        attempt.manual_score = ZERO_SCORE
        attempt.score = objective_score
        attempt.is_passed = objective_score >= attempt.exam.pass_score
    await session.flush()
    return attempt


def _submission_response(attempt: ExamAttempt) -> AttemptSubmissionResponse:
    if (
        attempt.submitted_at is None
        or attempt.submit_reason is None
        or attempt.objective_score is None
    ):
        raise ResourceConflictError("考试交卷状态不完整")
    return AttemptSubmissionResponse(
        attempt_id=attempt.id,
        status=attempt.status,
        grading_status=attempt.grading_status,
        submitted_at=attempt.submitted_at,
        submit_reason=attempt.submit_reason,
        objective_score=attempt.objective_score,
        manual_score=attempt.manual_score,
        score=attempt.score,
        is_passed=attempt.is_passed,
    )


async def submit_attempt(
    session: AsyncSession,
    attempt_id: int,
    current_user: User,
    *,
    now: datetime | None = None,
) -> AttemptSubmissionResponse:
    current_time = now or utc_now()
    attempt = await _get_owned_attempt(
        session,
        attempt_id,
        current_user.id,
        for_update=True,
    )
    if attempt.status == ExamAttemptStatus.IN_PROGRESS:
        reason = (
            SubmitReason.TIMEOUT
            if current_time >= attempt.deadline_at
            else SubmitReason.MANUAL
        )
        await finalize_attempt(
            session,
            attempt,
            submit_reason=reason,
            now=current_time,
        )
        await session.commit()
    return _submission_response(attempt)


def _snapshot_option_keys(snapshot: ExamQuestion) -> list[str]:
    if snapshot.question_type not in CHOICE_QUESTION_TYPES:
        return []
    if not snapshot.options:
        raise ResourceConflictError("考试题目快照选项不完整")
    try:
        ordered = sorted(snapshot.options, key=lambda option: int(option["sort_order"]))
        keys = [str(option["key"]).strip().upper() for option in ordered]
    except (KeyError, TypeError, ValueError):
        raise ResourceConflictError("考试题目快照选项不完整") from None
    if not keys or len(keys) != len(set(keys)):
        raise ResourceConflictError("考试题目快照选项不完整")
    return keys


def normalize_student_answer(
    snapshot: ExamQuestion,
    answer: list[str] | None,
) -> list[str] | None:
    if not answer:
        return None

    if snapshot.question_type == QuestionType.SINGLE_CHOICE:
        if len(answer) != 1:
            raise InvalidRequestError("单选题只能选择一个答案")
        valid_keys = _snapshot_option_keys(snapshot)
        selected = answer[0].strip().upper()
        if selected not in valid_keys:
            raise InvalidRequestError("答案包含不存在的选项")
        return [selected]

    if snapshot.question_type == QuestionType.MULTIPLE_CHOICE:
        valid_keys = _snapshot_option_keys(snapshot)
        selected = {value.strip().upper() for value in answer}
        if "" in selected or not selected.issubset(set(valid_keys)):
            raise InvalidRequestError("答案包含不存在的选项")
        return [key for key in valid_keys if key in selected]

    if snapshot.question_type == QuestionType.TRUE_FALSE:
        if len(answer) != 1:
            raise InvalidRequestError("判断题只能选择一个答案")
        selected = answer[0].strip().lower()
        if selected not in {"true", "false"}:
            raise InvalidRequestError("判断题答案必须为 true 或 false")
        return [selected]

    if snapshot.question_type in MANUAL_GRADED_QUESTION_TYPES:
        if len(answer) != 1:
            raise InvalidRequestError("人工阅卷题必须提交一段文本答案")
        text = answer[0].strip()
        if not text:
            return None
        if len(text) > MAX_MANUAL_ANSWER_LENGTH:
            raise InvalidRequestError("文本答案不能超过 20000 个字符")
        return [text]

    raise ResourceConflictError("考试题型不受支持")


async def save_answer(
    session: AsyncSession,
    attempt_id: int,
    exam_question_id: int,
    raw_answer: list[str] | None,
    current_user: User,
    *,
    now: datetime | None = None,
) -> SavedAnswerResponse:
    current_time = now or utc_now()
    student_user_id = current_user.id
    attempt = await _get_owned_attempt(
        session,
        attempt_id,
        student_user_id,
        for_update=True,
    )
    if attempt.status != ExamAttemptStatus.IN_PROGRESS:
        raise ResourceConflictError("当前考试状态不允许保存答案")
    if current_time >= attempt.deadline_at:
        await finalize_attempt(
            session,
            attempt,
            submit_reason=SubmitReason.TIMEOUT,
            now=current_time,
        )
        await session.commit()
        raise ResourceConflictError("考试作答时间已结束")

    snapshot = await session.scalar(
        select(ExamQuestion).where(
            ExamQuestion.id == exam_question_id,
            ExamQuestion.exam_id == attempt.exam_id,
        )
    )
    if snapshot is None:
        raise ResourceNotFoundError("考试题目不存在")
    normalized = normalize_student_answer(snapshot, raw_answer)
    owned_attempt_id = attempt.id
    snapshot_id = snapshot.id

    answer = await session.scalar(
        select(ExamAnswer).where(
            ExamAnswer.attempt_id == owned_attempt_id,
            ExamAnswer.exam_question_id == snapshot_id,
        )
    )
    if answer is None:
        answer = ExamAnswer(
            attempt_id=owned_attempt_id,
            exam_question_id=snapshot_id,
            answer=normalized,
            is_correct=None,
            score_awarded=None,
            grading_status=AnswerGradingStatus.NOT_GRADED,
            grader_id=None,
            grading_comment=None,
            graded_at=None,
            answered_at=current_time,
        )
        session.add(answer)
    else:
        answer.answer = normalized
        answer.answered_at = current_time

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        answer = await session.scalar(
            select(ExamAnswer).where(
                ExamAnswer.attempt_id == owned_attempt_id,
                ExamAnswer.exam_question_id == snapshot_id,
            )
        )
        if answer is None:
            raise ResourceConflictError("保存答案失败，请重试") from None
        answer.answer = normalized
        answer.answered_at = current_time
        await session.commit()

    return SavedAnswerResponse(
        exam_question_id=snapshot_id,
        answer=answer.answer,
        answered_at=answer.answered_at,
    )
