from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.core.schemas import PageResponse
from app.modules.attempts.enums import AttemptGradingStatus
from app.modules.auth.dependencies import SessionDependency
from app.modules.auth.permissions import StudentOnly, TeacherOrAdmin
from app.modules.results import service
from app.modules.results.schemas import (
    ExamResultsPage,
    GradingAttemptDetail,
    GradingTaskItem,
    ManualGradeRequest,
    MyResultDetail,
    MyResultItem,
)

grading_router = APIRouter(prefix="/grading", tags=["grading"])
my_results_router = APIRouter(prefix="/my-results", tags=["student-results"])
exam_results_router = APIRouter(prefix="/exams", tags=["exam-results"])


@grading_router.get("/tasks", response_model=PageResponse[GradingTaskItem])
async def list_grading_tasks(
    session: SessionDependency,
    current_user: TeacherOrAdmin,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    exam_id: Annotated[int | None, Query(gt=0)] = None,
    grading_status: AttemptGradingStatus | None = None,
) -> PageResponse[GradingTaskItem]:
    items, total = await service.list_grading_tasks(
        session,
        current_user,
        page=page,
        page_size=page_size,
        exam_id=exam_id,
        grading_status=grading_status,
    )
    return PageResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@grading_router.get(
    "/attempts/{attempt_id}",
    response_model=GradingAttemptDetail,
)
async def get_grading_attempt(
    attempt_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> GradingAttemptDetail:
    return await service.get_grading_detail(session, attempt_id, current_user)


@grading_router.put(
    "/attempts/{attempt_id}/answers/{exam_question_id}",
    response_model=GradingAttemptDetail,
)
async def grade_manual_answer(
    attempt_id: Annotated[int, Path(gt=0)],
    exam_question_id: Annotated[int, Path(gt=0)],
    payload: ManualGradeRequest,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> GradingAttemptDetail:
    return await service.grade_manual_answer(
        session,
        attempt_id,
        exam_question_id,
        score_awarded=payload.score_awarded,
        grading_comment=payload.grading_comment,
        current_user=current_user,
    )


@my_results_router.get("", response_model=PageResponse[MyResultItem])
async def list_my_results(
    session: SessionDependency,
    current_user: StudentOnly,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PageResponse[MyResultItem]:
    items, total = await service.list_my_results(
        session,
        current_user,
        page=page,
        page_size=page_size,
    )
    return PageResponse(items=items, total=total, page=page, page_size=page_size)


@my_results_router.get("/{attempt_id}", response_model=MyResultDetail)
async def get_my_result(
    attempt_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
    current_user: StudentOnly,
) -> MyResultDetail:
    return await service.get_my_result(session, attempt_id, current_user)


@exam_results_router.get(
    "/{exam_id}/results",
    response_model=ExamResultsPage,
)
async def list_exam_results(
    exam_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
    current_user: TeacherOrAdmin,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    keyword: Annotated[str | None, Query(max_length=100)] = None,
    grading_status: AttemptGradingStatus | None = None,
) -> ExamResultsPage:
    items, total, summary = await service.list_exam_results(
        session,
        exam_id,
        current_user,
        page=page,
        page_size=page_size,
        keyword=keyword,
        grading_status=grading_status,
    )
    return ExamResultsPage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        summary=summary,
    )
