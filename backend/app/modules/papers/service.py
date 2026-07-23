from decimal import Decimal

from sqlalchemy import Select, func, or_, select
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
from app.modules.papers.enums import PaperStatus
from app.modules.papers.models import Paper, PaperQuestion
from app.modules.papers.schemas import (
    PaperCreate,
    PaperQuestionBatchAdd,
    PaperUpdate,
)
from app.modules.questions.models import Question
from app.modules.users.models import User

ZERO_SCORE = Decimal("0.00")


def _is_admin(user: User) -> bool:
    return "admin" in effective_role_codes(user)


def _accessible_paper_query(user: User) -> Select[tuple[Paper]]:
    query = select(Paper).where(Paper.id > 0)
    if not _is_admin(user):
        query = query.where(Paper.created_by == user.id)
    return query


async def _commit(session: AsyncSession) -> None:
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ResourceConflictError("试卷数据存在冲突") from None
    except SQLAlchemyError:
        await session.rollback()
        raise


def _ensure_draft(paper: Paper) -> None:
    if paper.status != PaperStatus.DRAFT:
        raise ResourceConflictError("只有草稿试卷可以修改")


async def _get_owned_paper(
    session: AsyncSession,
    paper_id: int,
    current_user: User,
    *,
    for_update: bool = False,
) -> Paper:
    query = _accessible_paper_query(current_user).where(Paper.id == paper_id)
    if for_update:
        query = query.with_for_update()
    paper = await session.scalar(query)
    if paper is None:
        raise ResourceNotFoundError("试卷不存在")
    return paper


async def _load_paper_questions(
    session: AsyncSession,
    paper_id: int,
) -> list[PaperQuestion]:
    result = await session.scalars(
        select(PaperQuestion)
        .where(PaperQuestion.paper_id == paper_id)
        .order_by(PaperQuestion.sort_order)
    )
    return list(result)


async def recalculate_total_score(
    session: AsyncSession,
    paper: Paper,
) -> Decimal:
    """Recalculate the authoritative score from persisted paper-question rows."""
    await session.flush()
    total = await session.scalar(
        select(func.sum(PaperQuestion.score)).where(PaperQuestion.paper_id == paper.id)
    )
    normalized_total = Decimal(total or ZERO_SCORE).quantize(Decimal("0.01"))
    paper.total_score = normalized_total
    return normalized_total


async def _renumber_questions(
    session: AsyncSession,
    items: list[PaperQuestion],
) -> None:
    """Renumber in two phases so MySQL unique constraints never see a collision."""
    for item in items:
        item.sort_order = -item.sort_order
    await session.flush()
    for sort_order, item in enumerate(items, start=1):
        item.sort_order = sort_order
    await session.flush()


async def create_paper(
    session: AsyncSession,
    payload: PaperCreate,
    current_user: User,
) -> Paper:
    paper = Paper(
        name=payload.name,
        description=payload.description,
        total_score=ZERO_SCORE,
        status=PaperStatus.DRAFT,
        created_by=current_user.id,
        creator=current_user,
    )
    session.add(paper)
    await _commit(session)
    return await get_paper(session, paper.id, current_user)


async def list_papers(
    session: AsyncSession,
    current_user: User,
    *,
    page: int,
    page_size: int,
    keyword: str | None = None,
    paper_status: PaperStatus | None = None,
) -> tuple[list[tuple[Paper, int]], int]:
    filters = []
    normalized_keyword = keyword.strip() if keyword is not None else ""
    if normalized_keyword:
        filters.append(
            or_(
                Paper.name.contains(normalized_keyword, autoescape=True),
                Paper.description.contains(normalized_keyword, autoescape=True),
            )
        )
    if paper_status is not None:
        filters.append(Paper.status == paper_status)
    if not _is_admin(current_user):
        filters.append(Paper.created_by == current_user.id)

    total = await session.scalar(select(func.count(Paper.id)).where(*filters))
    question_count = (
        select(func.count(PaperQuestion.id))
        .where(PaperQuestion.paper_id == Paper.id)
        .correlate(Paper)
        .scalar_subquery()
    )
    result = await session.execute(
        select(Paper, question_count.label("question_count"))
        .where(*filters)
        .options(joinedload(Paper.creator))
        .order_by(Paper.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return [(paper, int(count or 0)) for paper, count in result.all()], int(total or 0)


async def get_paper(
    session: AsyncSession,
    paper_id: int,
    current_user: User,
) -> Paper:
    query = (
        _accessible_paper_query(current_user)
        .where(Paper.id == paper_id)
        .options(
            joinedload(Paper.creator),
            selectinload(Paper.paper_questions)
            .joinedload(PaperQuestion.question)
            .selectinload(Question.options),
        )
        .execution_options(populate_existing=True)
    )
    paper = await session.scalar(query)
    if paper is None:
        raise ResourceNotFoundError("试卷不存在")
    return paper


async def update_paper(
    session: AsyncSession,
    paper_id: int,
    payload: PaperUpdate,
    current_user: User,
) -> Paper:
    paper = await _get_owned_paper(session, paper_id, current_user, for_update=True)
    _ensure_draft(paper)
    paper.name = payload.name
    paper.description = payload.description
    await _commit(session)
    return await get_paper(session, paper.id, current_user)


async def _get_accessible_active_questions(
    session: AsyncSession,
    question_ids: list[int],
    current_user: User,
) -> dict[int, Question]:
    query = select(Question).where(Question.id.in_(question_ids))
    if not _is_admin(current_user):
        query = query.where(Question.created_by == current_user.id)
    questions = {question.id: question for question in await session.scalars(query)}
    missing_ids = sorted(set(question_ids).difference(questions))
    if missing_ids:
        raise ResourceNotFoundError("题目不存在")
    if any(question.status != RecordStatus.ACTIVE for question in questions.values()):
        raise ResourceConflictError("已禁用题目不能加入试卷")
    return questions


async def add_paper_questions(
    session: AsyncSession,
    paper_id: int,
    payload: PaperQuestionBatchAdd,
    current_user: User,
) -> Paper:
    paper = await _get_owned_paper(session, paper_id, current_user, for_update=True)
    _ensure_draft(paper)

    question_ids = [item.question_id for item in payload.items]
    if len(question_ids) != len(set(question_ids)):
        raise ResourceConflictError("批量添加的题目不能重复")

    existing_ids = set(
        await session.scalars(
            select(PaperQuestion.question_id).where(
                PaperQuestion.paper_id == paper.id,
                PaperQuestion.question_id.in_(question_ids),
            )
        )
    )
    if existing_ids:
        raise ResourceConflictError("题目已存在于当前试卷")

    questions = await _get_accessible_active_questions(session, question_ids, current_user)
    current_max_order = await session.scalar(
        select(func.max(PaperQuestion.sort_order)).where(
            PaperQuestion.paper_id == paper.id
        )
    )
    start_order = int(current_max_order or 0)

    # All validation is complete before the first relationship row is staged.
    for offset, item in enumerate(payload.items, start=1):
        session.add(
            PaperQuestion(
                paper=paper,
                question=questions[item.question_id],
                score=item.score,
                sort_order=start_order + offset,
            )
        )

    await recalculate_total_score(session, paper)
    await _commit(session)
    return await get_paper(session, paper.id, current_user)


async def remove_paper_question(
    session: AsyncSession,
    paper_id: int,
    question_id: int,
    current_user: User,
) -> Paper:
    paper = await _get_owned_paper(session, paper_id, current_user, for_update=True)
    _ensure_draft(paper)
    item = await session.scalar(
        select(PaperQuestion).where(
            PaperQuestion.paper_id == paper.id,
            PaperQuestion.question_id == question_id,
        )
    )
    if item is None:
        raise ResourceNotFoundError("试卷题目不存在")

    await session.delete(item)
    await session.flush()
    remaining_items = await _load_paper_questions(session, paper.id)
    await _renumber_questions(session, remaining_items)
    await recalculate_total_score(session, paper)
    await _commit(session)
    return await get_paper(session, paper.id, current_user)


async def update_paper_question_score(
    session: AsyncSession,
    paper_id: int,
    question_id: int,
    score: Decimal,
    current_user: User,
) -> Paper:
    paper = await _get_owned_paper(session, paper_id, current_user, for_update=True)
    _ensure_draft(paper)
    item = await session.scalar(
        select(PaperQuestion).where(
            PaperQuestion.paper_id == paper.id,
            PaperQuestion.question_id == question_id,
        )
    )
    if item is None:
        raise ResourceNotFoundError("试卷题目不存在")
    item.score = score
    await recalculate_total_score(session, paper)
    await _commit(session)
    return await get_paper(session, paper.id, current_user)


async def reorder_paper_questions(
    session: AsyncSession,
    paper_id: int,
    paper_question_ids: list[int],
    current_user: User,
) -> Paper:
    paper = await _get_owned_paper(session, paper_id, current_user, for_update=True)
    _ensure_draft(paper)
    if len(paper_question_ids) != len(set(paper_question_ids)):
        raise InvalidRequestError("排序 ID 不能重复")

    current_items = await _load_paper_questions(session, paper.id)
    current_by_id = {item.id: item for item in current_items}
    if len(paper_question_ids) != len(current_items):
        raise InvalidRequestError("排序必须包含当前试卷的全部题目")
    if set(paper_question_ids) != set(current_by_id):
        raise InvalidRequestError("排序包含不属于当前试卷的题目")

    reordered_items = [current_by_id[item_id] for item_id in paper_question_ids]
    await _renumber_questions(session, reordered_items)
    await _commit(session)
    return await get_paper(session, paper.id, current_user)


async def update_paper_status(
    session: AsyncSession,
    paper_id: int,
    paper_status: PaperStatus,
    current_user: User,
) -> Paper:
    paper = await _get_owned_paper(session, paper_id, current_user, for_update=True)
    if paper_status == PaperStatus.ACTIVE:
        question_count = await session.scalar(
            select(func.count(PaperQuestion.id)).where(PaperQuestion.paper_id == paper.id)
        )
        await recalculate_total_score(session, paper)
        if not question_count or paper.total_score <= ZERO_SCORE:
            raise ResourceConflictError("空白试卷或总分为零的试卷不能启用")
    paper.status = paper_status
    await _commit(session)
    return await get_paper(session, paper.id, current_user)
