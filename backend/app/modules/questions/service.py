from dataclasses import dataclass

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.exceptions import (
    InvalidRequestError,
    ResourceConflictError,
    ResourceNotFoundError,
)
from app.db.enums import RecordStatus
from app.modules.auth.permissions import effective_role_codes
from app.modules.questions.enums import (
    AUTO_GRADED_QUESTION_TYPES,
    CHOICE_QUESTION_TYPES,
    MANUAL_GRADED_QUESTION_TYPES,
    QuestionDifficulty,
    QuestionType,
)
from app.modules.questions.models import Question, QuestionOption
from app.modules.questions.schemas import QuestionCreate, QuestionUpdate
from app.modules.users.models import User


@dataclass(frozen=True, slots=True)
class NormalizedOption:
    option_key: str
    option_content: str
    sort_order: int


@dataclass(frozen=True, slots=True)
class NormalizedQuestion:
    question_type: QuestionType
    content: str
    options: tuple[NormalizedOption, ...]
    correct_answer: list[str] | None
    reference_answer: str | None
    analysis: str | None
    difficulty: QuestionDifficulty


def _normalize_question(payload: QuestionCreate | QuestionUpdate) -> NormalizedQuestion:
    options = tuple(
        NormalizedOption(
            option_key=item.option_key,
            option_content=item.option_content,
            sort_order=item.sort_order,
        )
        for item in payload.options
    )
    option_keys = [item.option_key for item in options]

    if len(option_keys) != len(set(option_keys)):
        raise InvalidRequestError("选项编码不能重复")

    if payload.question_type in MANUAL_GRADED_QUESTION_TYPES:
        if options:
            raise InvalidRequestError("人工阅卷题不能包含选项")
        if payload.correct_answer is not None:
            raise InvalidRequestError("人工阅卷题的正确答案必须为空")
        answers = None
    elif payload.question_type == QuestionType.TRUE_FALSE:
        if options:
            raise InvalidRequestError("判断题不能包含选项")
        if payload.correct_answer is None:
            raise InvalidRequestError("自动阅卷题必须提供正确答案")
        answers = [item.strip() for item in payload.correct_answer]
        if len(answers) != 1 or answers[0] not in {"true", "false"}:
            raise InvalidRequestError("判断题正确答案必须严格为 true 或 false")
    elif payload.question_type in CHOICE_QUESTION_TYPES:
        if len(options) < 2:
            raise InvalidRequestError("选择题至少需要两个选项")
        if payload.correct_answer is None:
            raise InvalidRequestError("自动阅卷题必须提供正确答案")
        answers = [item.strip().upper() for item in payload.correct_answer]
        if any(not item for item in answers):
            raise InvalidRequestError("正确答案不能为空")
        if len(answers) != len(set(answers)):
            raise InvalidRequestError("正确答案不能包含重复值")
        if payload.question_type == QuestionType.SINGLE_CHOICE and len(answers) != 1:
            raise InvalidRequestError("单选题必须且只能有一个正确答案")
        if payload.question_type == QuestionType.MULTIPLE_CHOICE and len(answers) < 2:
            raise InvalidRequestError("多选题至少需要两个正确答案")
        missing_answers = sorted(set(answers).difference(option_keys))
        if missing_answers:
            raise InvalidRequestError(f"正确答案对应的选项不存在：{', '.join(missing_answers)}")
        answers = sorted(answers)
    else:  # pragma: no cover - the enum prevents unsupported values
        raise InvalidRequestError("不支持的题型")

    if payload.question_type in AUTO_GRADED_QUESTION_TYPES:
        if payload.reference_answer is not None:
            raise InvalidRequestError("自动阅卷题不能设置人工阅卷参考答案")
        reference_answer = None
    else:
        reference_answer = payload.reference_answer

    return NormalizedQuestion(
        question_type=payload.question_type,
        content=payload.content,
        options=options,
        correct_answer=answers,
        reference_answer=reference_answer,
        analysis=payload.analysis,
        difficulty=payload.difficulty,
    )


def validate_question_payload(
    payload: QuestionCreate | QuestionUpdate,
) -> NormalizedQuestion:
    """Run the canonical five-question-type validation without writing data."""
    return _normalize_question(payload)


def _is_admin(user: User) -> bool:
    return "admin" in effective_role_codes(user)


def _accessible_question_query(user: User) -> Select[tuple[Question]]:
    query = select(Question).where(Question.id > 0)
    if not _is_admin(user):
        query = query.where(Question.created_by == user.id)
    return query


def _build_options(data: NormalizedQuestion) -> list[QuestionOption]:
    return [
        QuestionOption(
            option_key=item.option_key,
            option_content=item.option_content,
            sort_order=item.sort_order,
        )
        for item in data.options
    ]


async def _commit(session: AsyncSession) -> None:
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ResourceConflictError("题目数据存在冲突") from None
    except SQLAlchemyError:
        await session.rollback()
        raise


async def _flush(session: AsyncSession) -> None:
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ResourceConflictError("题目数据存在冲突") from None
    except SQLAlchemyError:
        await session.rollback()
        raise


async def create_question(
    session: AsyncSession,
    payload: QuestionCreate,
    current_user: User,
) -> Question:
    data = _normalize_question(payload)
    question = Question(
        question_type=data.question_type,
        content=data.content,
        correct_answer=data.correct_answer,
        reference_answer=data.reference_answer,
        analysis=data.analysis,
        difficulty=data.difficulty,
        status=RecordStatus.ACTIVE,
        created_by=current_user.id,
        creator=current_user,
    )
    question.options = _build_options(data)
    session.add(question)
    await _commit(session)
    return await get_question(session, question.id, current_user)


async def create_questions_batch(
    session: AsyncSession,
    payloads: list[QuestionCreate],
    current_user: User,
) -> list[Question]:
    """Create an already-previewed batch in one transaction.

    Validation is deliberately rerun here so the preview response is never
    treated as trusted import data.
    """
    questions: list[Question] = []
    for payload in payloads:
        data = validate_question_payload(payload)
        question = Question(
            question_type=data.question_type,
            content=data.content,
            correct_answer=data.correct_answer,
            reference_answer=data.reference_answer,
            analysis=data.analysis,
            difficulty=data.difficulty,
            status=RecordStatus.ACTIVE,
            created_by=current_user.id,
            creator=current_user,
        )
        question.options = _build_options(data)
        session.add(question)
        questions.append(question)

    await _commit(session)
    return questions


async def list_questions(
    session: AsyncSession,
    current_user: User,
    *,
    page: int,
    page_size: int,
    keyword: str | None = None,
    question_type: QuestionType | None = None,
    difficulty: QuestionDifficulty | None = None,
    record_status: RecordStatus | None = None,
) -> tuple[list[Question], int]:
    filters = []
    normalized_keyword = keyword.strip() if keyword is not None else ""
    if normalized_keyword:
        filters.append(Question.content.contains(normalized_keyword, autoescape=True))
    if question_type is not None:
        filters.append(Question.question_type == question_type)
    if difficulty is not None:
        filters.append(Question.difficulty == difficulty)
    if record_status is not None:
        filters.append(Question.status == record_status)
    if not _is_admin(current_user):
        filters.append(Question.created_by == current_user.id)

    total = await session.scalar(select(func.count(Question.id)).where(*filters))
    query = (
        select(Question)
        .where(*filters)
        .options(joinedload(Question.creator))
        .order_by(Question.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await session.scalars(query)
    return list(result), int(total or 0)


async def get_question(
    session: AsyncSession,
    question_id: int,
    current_user: User,
) -> Question:
    query = (
        _accessible_question_query(current_user)
        .where(Question.id == question_id)
        .options(
            joinedload(Question.creator),
            selectinload(Question.options),
        )
    )
    question = await session.scalar(query)
    if question is None:
        raise ResourceNotFoundError("题目不存在")
    return question


async def update_question(
    session: AsyncSession,
    question_id: int,
    payload: QuestionUpdate,
    current_user: User,
) -> Question:
    data = _normalize_question(payload)
    question = await get_question(session, question_id, current_user)

    question.question_type = data.question_type
    question.content = data.content
    question.correct_answer = data.correct_answer
    question.reference_answer = data.reference_answer
    question.analysis = data.analysis
    question.difficulty = data.difficulty
    question.options.clear()
    await _flush(session)
    for option in _build_options(data):
        option.question = question
        session.add(option)
    await _commit(session)
    return await get_question(session, question.id, current_user)


async def update_question_status(
    session: AsyncSession,
    question_id: int,
    record_status: RecordStatus,
    current_user: User,
) -> Question:
    question = await get_question(session, question_id, current_user)
    question.status = record_status
    await _commit(session)
    return await get_question(session, question.id, current_user)
