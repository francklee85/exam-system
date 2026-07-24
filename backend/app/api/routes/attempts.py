from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.core.schemas import PageResponse
from app.modules.attempts import service
from app.modules.attempts.schemas import (
    AnswerSaveRequest,
    ExamAttemptResponse,
    MyExamDetail,
    MyExamListItem,
    SavedAnswerResponse,
)
from app.modules.auth.dependencies import SessionDependency
from app.modules.auth.permissions import StudentOnly

my_exams_router = APIRouter(prefix="/my-exams", tags=["student-exams"])
attempts_router = APIRouter(prefix="/attempts", tags=["student-attempts"])


@my_exams_router.get("", response_model=PageResponse[MyExamListItem])
async def list_my_exams(
    session: SessionDependency,
    current_user: StudentOnly,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PageResponse[MyExamListItem]:
    items, total = await service.list_my_exams(
        session,
        current_user,
        page=page,
        page_size=page_size,
    )
    return PageResponse[MyExamListItem](
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@my_exams_router.get("/{exam_id}", response_model=MyExamDetail)
async def get_my_exam(
    exam_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
    current_user: StudentOnly,
) -> MyExamDetail:
    return await service.get_my_exam(session, exam_id, current_user)


@my_exams_router.post("/{exam_id}/start", response_model=ExamAttemptResponse)
async def start_exam(
    exam_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
    current_user: StudentOnly,
) -> ExamAttemptResponse:
    return await service.start_exam(session, exam_id, current_user)


@attempts_router.get("/{attempt_id}", response_model=ExamAttemptResponse)
async def get_attempt(
    attempt_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
    current_user: StudentOnly,
) -> ExamAttemptResponse:
    return await service.get_attempt_response(session, attempt_id, current_user)


@attempts_router.put(
    "/{attempt_id}/answers/{exam_question_id}",
    response_model=SavedAnswerResponse,
)
async def save_answer(
    attempt_id: Annotated[int, Path(gt=0)],
    exam_question_id: Annotated[int, Path(gt=0)],
    payload: AnswerSaveRequest,
    session: SessionDependency,
    current_user: StudentOnly,
) -> SavedAnswerResponse:
    return await service.save_answer(
        session,
        attempt_id,
        exam_question_id,
        payload.answer,
        current_user,
    )
