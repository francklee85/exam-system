from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import Select, delete, func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.exceptions import ResourceConflictError, ResourceNotFoundError
from app.db.enums import RecordStatus
from app.db.mixins import utc_now
from app.modules.auth.permissions import effective_role_codes
from app.modules.classes.models import Class
from app.modules.exams.enums import ExamStatus, ExamTargetType
from app.modules.exams.models import Exam, ExamQuestion, ExamTarget
from app.modules.exams.schemas import (
    ExamCreate,
    ExamTargetInput,
    ExamTargetResponse,
    ExamUpdate,
)
from app.modules.majors.models import Major
from app.modules.papers.enums import PaperStatus
from app.modules.papers.models import Paper, PaperQuestion
from app.modules.questions.enums import QuestionType
from app.modules.questions.models import Question
from app.modules.users.models import User

ZERO_SCORE = Decimal("0.00")


@dataclass(frozen=True, slots=True)
class ExamView:
    exam: Exam
    target: ExamTargetResponse | None
    snapshot_question_count: int


def _is_admin(user: User) -> bool:
    return "admin" in effective_role_codes(user)


def _accessible_exam_query(user: User) -> Select[tuple[Exam]]:
    query = select(Exam).where(Exam.id > 0)
    if not _is_admin(user):
        query = query.where(Exam.created_by == user.id)
    return query


async def _commit(session: AsyncSession) -> None:
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ResourceConflictError("考试数据存在冲突") from None
    except SQLAlchemyError:
        await session.rollback()
        raise


def _ensure_draft(exam: Exam) -> None:
    if exam.status != ExamStatus.DRAFT:
        raise ResourceConflictError("已发布或已结束的考试不能修改")


async def _get_owned_exam(
    session: AsyncSession,
    exam_id: int,
    current_user: User,
    *,
    for_update: bool = False,
) -> Exam:
    query = _accessible_exam_query(current_user).where(Exam.id == exam_id)
    if for_update:
        query = query.with_for_update()
    exam = await session.scalar(query)
    if exam is None:
        raise ResourceNotFoundError("考试不存在")
    return exam


async def _get_usable_paper(
    session: AsyncSession,
    paper_id: int,
    current_user: User,
    *,
    for_update: bool = False,
) -> Paper:
    query = select(Paper).where(Paper.id == paper_id)
    if not _is_admin(current_user):
        query = query.where(Paper.created_by == current_user.id)
    if for_update:
        query = query.with_for_update()
    paper = await session.scalar(query)
    if paper is None:
        raise ResourceNotFoundError("试卷不存在")
    if paper.status != PaperStatus.ACTIVE:
        raise ResourceConflictError("只有已启用试卷可以用于考试")

    question_count = await session.scalar(
        select(func.count(PaperQuestion.id)).where(PaperQuestion.paper_id == paper.id)
    )
    if not question_count or paper.total_score <= ZERO_SCORE:
        raise ResourceConflictError("空白试卷或总分为零的试卷不能用于考试")
    return paper


def _validate_pass_score(pass_score: Decimal, total_score: Decimal) -> None:
    if pass_score > total_score:
        raise ResourceConflictError("及格分不能大于试卷总分")


def _validate_exam_configuration(exam: Exam) -> None:
    if not exam.name.strip():
        raise ResourceConflictError("考试名称不能为空")
    if exam.start_time >= exam.end_time:
        raise ResourceConflictError("开始时间必须早于结束时间")
    if exam.duration_minutes <= 0:
        raise ResourceConflictError("考试时长必须大于 0")
    if exam.pass_score < ZERO_SCORE:
        raise ResourceConflictError("及格分不能小于 0")


async def _validate_target(
    session: AsyncSession,
    target: ExamTargetInput,
) -> None:
    if target.target_type == ExamTargetType.ALL:
        return
    if target.target_type == ExamTargetType.MAJOR:
        major = await session.scalar(select(Major).where(Major.id == target.target_id))
        if major is None:
            raise ResourceNotFoundError("专业不存在")
        if major.status != RecordStatus.ACTIVE:
            raise ResourceConflictError("已禁用专业不能作为考试对象")
        return

    class_record = await session.scalar(
        select(Class)
        .where(Class.id == target.target_id)
        .options(joinedload(Class.major))
    )
    if class_record is None:
        raise ResourceNotFoundError("班级不存在")
    if class_record.status != RecordStatus.ACTIVE:
        raise ResourceConflictError("已禁用班级不能作为考试对象")
    if class_record.major.status != RecordStatus.ACTIVE:
        raise ResourceConflictError("班级所属专业已禁用，不能作为考试对象")


async def _replace_target(
    session: AsyncSession,
    exam: Exam,
    target: ExamTargetInput | None,
) -> None:
    await session.execute(delete(ExamTarget).where(ExamTarget.exam_id == exam.id))
    if target is not None:
        session.add(
            ExamTarget(
                exam_id=exam.id,
                target_type=target.target_type,
                target_id=target.target_id,
            )
        )


async def _get_single_target(
    session: AsyncSession,
    exam_id: int,
) -> ExamTarget | None:
    targets = list(
        await session.scalars(
            select(ExamTarget)
            .where(ExamTarget.exam_id == exam_id)
            .order_by(ExamTarget.id)
        )
    )
    if len(targets) > 1:
        raise ResourceConflictError("V1 一场考试只能配置一个考试对象")
    return targets[0] if targets else None


async def _resolve_target_response(
    session: AsyncSession,
    target: ExamTarget | None,
) -> ExamTargetResponse | None:
    if target is None:
        return None
    if target.target_type == ExamTargetType.ALL:
        return ExamTargetResponse(type=ExamTargetType.ALL, id=None, name="全部学生")
    if target.target_type == ExamTargetType.MAJOR:
        major = await session.scalar(select(Major).where(Major.id == target.target_id))
        name = major.name if major is not None else "专业已不存在"
        return ExamTargetResponse(type=ExamTargetType.MAJOR, id=target.target_id, name=name)

    class_record = await session.scalar(select(Class).where(Class.id == target.target_id))
    name = class_record.name if class_record is not None else "班级已不存在"
    return ExamTargetResponse(type=ExamTargetType.CLASS, id=target.target_id, name=name)


async def _resolve_target_responses(
    session: AsyncSession,
    exams: list[Exam],
) -> dict[int, ExamTargetResponse]:
    target_by_exam: dict[int, ExamTarget] = {}
    for exam in exams:
        if len(exam.targets) > 1:
            raise ResourceConflictError("V1 一场考试只能配置一个考试对象")
        if exam.targets:
            target_by_exam[exam.id] = exam.targets[0]

    major_ids = {
        target.target_id
        for target in target_by_exam.values()
        if target.target_type == ExamTargetType.MAJOR and target.target_id is not None
    }
    class_ids = {
        target.target_id
        for target in target_by_exam.values()
        if target.target_type == ExamTargetType.CLASS and target.target_id is not None
    }
    major_names = {
        major.id: major.name
        for major in await session.scalars(select(Major).where(Major.id.in_(major_ids)))
    }
    class_names = {
        item.id: item.name
        for item in await session.scalars(select(Class).where(Class.id.in_(class_ids)))
    }

    responses: dict[int, ExamTargetResponse] = {}
    for exam_id, target in target_by_exam.items():
        if target.target_type == ExamTargetType.ALL:
            responses[exam_id] = ExamTargetResponse(
                type=ExamTargetType.ALL,
                id=None,
                name="全部学生",
            )
        elif target.target_type == ExamTargetType.MAJOR:
            responses[exam_id] = ExamTargetResponse(
                type=ExamTargetType.MAJOR,
                id=target.target_id,
                name=major_names.get(target.target_id, "专业已不存在"),
            )
        else:
            responses[exam_id] = ExamTargetResponse(
                type=ExamTargetType.CLASS,
                id=target.target_id,
                name=class_names.get(target.target_id, "班级已不存在"),
            )
    return responses


async def create_exam(
    session: AsyncSession,
    payload: ExamCreate,
    current_user: User,
) -> ExamView:
    paper = await _get_usable_paper(session, payload.paper_id, current_user)
    _validate_pass_score(payload.pass_score, paper.total_score)
    if payload.target is not None:
        await _validate_target(session, payload.target)

    exam = Exam(
        name=payload.name,
        paper=paper,
        description=payload.description,
        start_time=payload.start_time,
        end_time=payload.end_time,
        duration_minutes=payload.duration_minutes,
        pass_score=payload.pass_score,
        total_score=paper.total_score,
        status=ExamStatus.DRAFT,
        published_at=None,
        creator=current_user,
    )
    session.add(exam)
    await session.flush()
    if payload.target is not None:
        session.add(
            ExamTarget(
                exam=exam,
                target_type=payload.target.target_type,
                target_id=payload.target.target_id,
            )
        )
    await _commit(session)
    return await get_exam(session, exam.id, current_user)


async def list_exams(
    session: AsyncSession,
    current_user: User,
    *,
    page: int,
    page_size: int,
    keyword: str | None = None,
    exam_status: ExamStatus | None = None,
) -> tuple[list[ExamView], int]:
    filters = []
    normalized_keyword = keyword.strip() if keyword is not None else ""
    if normalized_keyword:
        filters.append(
            or_(
                Exam.name.contains(normalized_keyword, autoescape=True),
                Exam.description.contains(normalized_keyword, autoescape=True),
            )
        )
    if exam_status is not None:
        filters.append(Exam.status == exam_status)
    if not _is_admin(current_user):
        filters.append(Exam.created_by == current_user.id)

    total = await session.scalar(select(func.count(Exam.id)).where(*filters))
    snapshot_count = (
        select(func.count(ExamQuestion.id))
        .where(ExamQuestion.exam_id == Exam.id)
        .correlate(Exam)
        .scalar_subquery()
    )
    rows = (
        await session.execute(
            select(Exam, snapshot_count.label("snapshot_question_count"))
            .where(*filters)
            .options(
                joinedload(Exam.paper),
                joinedload(Exam.creator),
                selectinload(Exam.targets),
            )
            .order_by(Exam.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    exams = [exam for exam, _ in rows]
    target_responses = await _resolve_target_responses(session, exams)
    return [
        ExamView(
            exam=exam,
            target=target_responses.get(exam.id),
            snapshot_question_count=int(count or 0),
        )
        for exam, count in rows
    ], int(total or 0)


async def get_exam(
    session: AsyncSession,
    exam_id: int,
    current_user: User,
) -> ExamView:
    exam = await session.scalar(
        _accessible_exam_query(current_user)
        .where(Exam.id == exam_id)
        .options(
            joinedload(Exam.paper),
            joinedload(Exam.creator),
            selectinload(Exam.targets),
        )
        .execution_options(populate_existing=True)
    )
    if exam is None:
        raise ResourceNotFoundError("考试不存在")
    if len(exam.targets) > 1:
        raise ResourceConflictError("V1 一场考试只能配置一个考试对象")
    target = await _resolve_target_response(
        session,
        exam.targets[0] if exam.targets else None,
    )
    snapshot_count = await session.scalar(
        select(func.count(ExamQuestion.id)).where(ExamQuestion.exam_id == exam.id)
    )
    return ExamView(
        exam=exam,
        target=target,
        snapshot_question_count=int(snapshot_count or 0),
    )


async def update_exam(
    session: AsyncSession,
    exam_id: int,
    payload: ExamUpdate,
    current_user: User,
) -> ExamView:
    exam = await _get_owned_exam(session, exam_id, current_user, for_update=True)
    _ensure_draft(exam)
    paper = await _get_usable_paper(session, payload.paper_id, current_user)
    _validate_pass_score(payload.pass_score, paper.total_score)
    if payload.target is not None:
        await _validate_target(session, payload.target)

    exam.name = payload.name
    exam.paper = paper
    exam.description = payload.description
    exam.start_time = payload.start_time
    exam.end_time = payload.end_time
    exam.duration_minutes = payload.duration_minutes
    exam.pass_score = payload.pass_score
    exam.total_score = paper.total_score
    await _replace_target(session, exam, payload.target)
    await _commit(session)
    return await get_exam(session, exam.id, current_user)


async def update_exam_target(
    session: AsyncSession,
    exam_id: int,
    target: ExamTargetInput,
    current_user: User,
) -> ExamView:
    exam = await _get_owned_exam(session, exam_id, current_user, for_update=True)
    _ensure_draft(exam)
    await _validate_target(session, target)
    await _replace_target(session, exam, target)
    await _commit(session)
    return await get_exam(session, exam.id, current_user)


def _validate_snapshot_source(item: PaperQuestion) -> None:
    question = item.question
    if not question.content.strip():
        raise ResourceConflictError("试卷包含题干为空的异常题目")
    if item.score <= ZERO_SCORE:
        raise ResourceConflictError("试卷包含分值不合法的题目")

    if question.question_type == QuestionType.TRUE_FALSE:
        if question.options or question.correct_answer not in (["true"], ["false"]):
            raise ResourceConflictError("试卷包含数据不完整的判断题")
        return

    option_keys = [option.option_key for option in question.options]
    option_orders = [option.sort_order for option in question.options]
    if (
        len(option_keys) < 2
        or len(option_keys) != len(set(option_keys))
        or len(option_orders) != len(set(option_orders))
        or any(
            not option.option_key.strip() or not option.option_content.strip()
            for option in question.options
        )
    ):
        raise ResourceConflictError("试卷包含选项不完整的选择题")
    answers = question.correct_answer
    if len(answers) != len(set(answers)) or not set(answers).issubset(option_keys):
        raise ResourceConflictError("试卷包含正确答案异常的选择题")
    if question.question_type == QuestionType.SINGLE_CHOICE and len(answers) != 1:
        raise ResourceConflictError("试卷包含正确答案异常的单选题")
    if question.question_type == QuestionType.MULTIPLE_CHOICE and len(answers) < 2:
        raise ResourceConflictError("试卷包含正确答案异常的多选题")


def _snapshot_from_paper_question(item: PaperQuestion) -> ExamQuestion:
    question = item.question
    options = (
        None
        if question.question_type == QuestionType.TRUE_FALSE
        else [
            {
                "key": option.option_key,
                "content": option.option_content,
                "sort_order": option.sort_order,
            }
            for option in sorted(question.options, key=lambda option: option.sort_order)
        ]
    )
    return ExamQuestion(
        original_question_id=question.id,
        question_type=question.question_type,
        content=question.content,
        options=options,
        correct_answer=list(question.correct_answer),
        analysis=question.analysis,
        score=item.score,
        sort_order=item.sort_order,
    )


async def publish_exam(
    session: AsyncSession,
    exam_id: int,
    current_user: User,
) -> ExamView:
    exam = await _get_owned_exam(session, exam_id, current_user, for_update=True)
    _ensure_draft(exam)
    _validate_exam_configuration(exam)
    paper = await _get_usable_paper(
        session,
        exam.paper_id,
        current_user,
        for_update=True,
    )
    target = await _get_single_target(session, exam.id)
    if target is None:
        raise ResourceConflictError("发布考试前必须配置考试对象")
    await _validate_target(
        session,
        ExamTargetInput(
            target_type=target.target_type,
            target_id=target.target_id,
        ),
    )

    paper_questions = list(
        await session.scalars(
            select(PaperQuestion)
            .where(PaperQuestion.paper_id == paper.id)
            .options(
                joinedload(PaperQuestion.question).selectinload(Question.options),
            )
            .order_by(PaperQuestion.sort_order)
        )
    )
    if not paper_questions:
        raise ResourceConflictError("空白试卷不能发布考试")
    actual_total = sum(
        (item.score for item in paper_questions),
        ZERO_SCORE,
    ).quantize(Decimal("0.01"))
    if actual_total <= ZERO_SCORE or actual_total != paper.total_score:
        raise ResourceConflictError("试卷总分与题目分值不一致")
    _validate_pass_score(exam.pass_score, actual_total)
    if [item.sort_order for item in paper_questions] != list(
        range(1, len(paper_questions) + 1)
    ):
        raise ResourceConflictError("试卷题目顺序不连续")
    for item in paper_questions:
        _validate_snapshot_source(item)

    # A draft should normally have no snapshots. Deleting first also repairs safe
    # leftovers; any later failure rolls this deletion back with the whole publish.
    await session.execute(delete(ExamQuestion).where(ExamQuestion.exam_id == exam.id))
    for item in paper_questions:
        snapshot = _snapshot_from_paper_question(item)
        snapshot.exam = exam
        session.add(snapshot)
    await session.flush()

    exam.total_score = actual_total
    exam.status = ExamStatus.PUBLISHED
    exam.published_at = utc_now()
    await _commit(session)
    return await get_exam(session, exam.id, current_user)


async def list_exam_questions(
    session: AsyncSession,
    exam_id: int,
    current_user: User,
) -> list[ExamQuestion]:
    await _get_owned_exam(session, exam_id, current_user)
    return list(
        await session.scalars(
            select(ExamQuestion)
            .where(ExamQuestion.exam_id == exam_id)
            .order_by(ExamQuestion.sort_order)
        )
    )


def student_matches_target(
    target_type: ExamTargetType,
    target_id: int | None,
    *,
    student_major_id: int,
    student_class_id: int,
) -> bool:
    if target_type == ExamTargetType.ALL:
        return True
    if target_type == ExamTargetType.MAJOR:
        return target_id == student_major_id
    return target_id == student_class_id
