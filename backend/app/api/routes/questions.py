from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.core.schemas import PageResponse, StatusUpdate
from app.db.enums import RecordStatus
from app.modules.auth.dependencies import SessionDependency
from app.modules.auth.permissions import TeacherOrAdmin
from app.modules.questions import service
from app.modules.questions.enums import QuestionDifficulty, QuestionType
from app.modules.questions.schemas import (
    QuestionCreate,
    QuestionListItem,
    QuestionResponse,
    QuestionUpdate,
)

router = APIRouter(prefix="/questions", tags=["questions"])


@router.get("", response_model=PageResponse[QuestionListItem])
async def list_questions(
    session: SessionDependency,
    current_user: TeacherOrAdmin,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    keyword: Annotated[str | None, Query(max_length=200)] = None,
    question_type: Annotated[QuestionType | None, Query()] = None,
    difficulty: Annotated[QuestionDifficulty | None, Query()] = None,
    record_status: Annotated[RecordStatus | None, Query(alias="status")] = None,
) -> PageResponse[QuestionListItem]:
    items, total = await service.list_questions(
        session,
        current_user,
        page=page,
        page_size=page_size,
        keyword=keyword,
        question_type=question_type,
        difficulty=difficulty,
        record_status=record_status,
    )
    return PageResponse[QuestionListItem](
        items=[QuestionListItem.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{question_id}", response_model=QuestionResponse)
async def get_question(
    question_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> QuestionResponse:
    question = await service.get_question(session, question_id, current_user)
    return QuestionResponse.model_validate(question)


@router.post("", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
async def create_question(
    payload: QuestionCreate,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> QuestionResponse:
    question = await service.create_question(session, payload, current_user)
    return QuestionResponse.model_validate(question)


@router.put("/{question_id}", response_model=QuestionResponse)
async def update_question(
    question_id: Annotated[int, Path(gt=0)],
    payload: QuestionUpdate,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> QuestionResponse:
    question = await service.update_question(
        session,
        question_id,
        payload,
        current_user,
    )
    return QuestionResponse.model_validate(question)


@router.patch("/{question_id}/status", response_model=QuestionResponse)
async def update_question_status(
    question_id: Annotated[int, Path(gt=0)],
    payload: StatusUpdate,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> QuestionResponse:
    question = await service.update_question_status(
        session,
        question_id,
        payload.status,
        current_user,
    )
    return QuestionResponse.model_validate(question)
