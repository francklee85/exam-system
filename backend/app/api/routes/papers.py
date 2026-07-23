from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.core.schemas import PageResponse
from app.modules.auth.dependencies import SessionDependency
from app.modules.auth.permissions import TeacherOrAdmin
from app.modules.papers import service
from app.modules.papers.enums import PaperStatus
from app.modules.papers.schemas import (
    PaperCreate,
    PaperListItem,
    PaperQuestionBatchAdd,
    PaperQuestionUpdate,
    PaperReorderRequest,
    PaperResponse,
    PaperStatusUpdate,
    PaperUpdate,
)

router = APIRouter(prefix="/papers", tags=["papers"])


@router.get("", response_model=PageResponse[PaperListItem])
async def list_papers(
    session: SessionDependency,
    current_user: TeacherOrAdmin,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    keyword: Annotated[str | None, Query(max_length=200)] = None,
    paper_status: Annotated[PaperStatus | None, Query(alias="status")] = None,
) -> PageResponse[PaperListItem]:
    rows, total = await service.list_papers(
        session,
        current_user,
        page=page,
        page_size=page_size,
        keyword=keyword,
        paper_status=paper_status,
    )
    return PageResponse[PaperListItem](
        items=[
            PaperListItem.from_paper(paper, question_count=question_count)
            for paper, question_count in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=PaperResponse, status_code=status.HTTP_201_CREATED)
async def create_paper(
    payload: PaperCreate,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> PaperResponse:
    paper = await service.create_paper(session, payload, current_user)
    return PaperResponse.from_paper_detail(paper)


@router.get("/{paper_id}", response_model=PaperResponse)
async def get_paper(
    paper_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> PaperResponse:
    paper = await service.get_paper(session, paper_id, current_user)
    return PaperResponse.from_paper_detail(paper)


@router.put("/{paper_id}", response_model=PaperResponse)
async def update_paper(
    paper_id: Annotated[int, Path(gt=0)],
    payload: PaperUpdate,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> PaperResponse:
    paper = await service.update_paper(session, paper_id, payload, current_user)
    return PaperResponse.from_paper_detail(paper)


@router.patch("/{paper_id}/status", response_model=PaperResponse)
async def update_paper_status(
    paper_id: Annotated[int, Path(gt=0)],
    payload: PaperStatusUpdate,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> PaperResponse:
    paper = await service.update_paper_status(
        session,
        paper_id,
        payload.status,
        current_user,
    )
    return PaperResponse.from_paper_detail(paper)


@router.post("/{paper_id}/questions", response_model=PaperResponse)
async def add_paper_questions(
    paper_id: Annotated[int, Path(gt=0)],
    payload: PaperQuestionBatchAdd,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> PaperResponse:
    paper = await service.add_paper_questions(session, paper_id, payload, current_user)
    return PaperResponse.from_paper_detail(paper)


@router.put("/{paper_id}/questions/order", response_model=PaperResponse)
async def reorder_paper_questions(
    paper_id: Annotated[int, Path(gt=0)],
    payload: PaperReorderRequest,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> PaperResponse:
    paper = await service.reorder_paper_questions(
        session,
        paper_id,
        payload.paper_question_ids,
        current_user,
    )
    return PaperResponse.from_paper_detail(paper)


@router.patch("/{paper_id}/questions/{question_id}", response_model=PaperResponse)
async def update_paper_question_score(
    paper_id: Annotated[int, Path(gt=0)],
    question_id: Annotated[int, Path(gt=0)],
    payload: PaperQuestionUpdate,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> PaperResponse:
    paper = await service.update_paper_question_score(
        session,
        paper_id,
        question_id,
        payload.score,
        current_user,
    )
    return PaperResponse.from_paper_detail(paper)


@router.delete("/{paper_id}/questions/{question_id}", response_model=PaperResponse)
async def remove_paper_question(
    paper_id: Annotated[int, Path(gt=0)],
    question_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> PaperResponse:
    paper = await service.remove_paper_question(
        session,
        paper_id,
        question_id,
        current_user,
    )
    return PaperResponse.from_paper_detail(paper)
