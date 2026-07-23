from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.core.schemas import PageResponse
from app.modules.auth.dependencies import SessionDependency
from app.modules.auth.permissions import TeacherOrAdmin
from app.modules.exams import service
from app.modules.exams.enums import ExamStatus
from app.modules.exams.schemas import (
    ExamCreate,
    ExamListItem,
    ExamQuestionSnapshotResponse,
    ExamResponse,
    ExamTargetInput,
    ExamUpdate,
)

router = APIRouter(prefix="/exams", tags=["exams"])


def _response_from_view(view: service.ExamView) -> ExamResponse:
    return ExamResponse.from_exam(
        view.exam,
        target=view.target,
        snapshot_question_count=view.snapshot_question_count,
    )


@router.get("", response_model=PageResponse[ExamListItem])
async def list_exams(
    session: SessionDependency,
    current_user: TeacherOrAdmin,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    keyword: Annotated[str | None, Query(max_length=200)] = None,
    exam_status: Annotated[ExamStatus | None, Query(alias="status")] = None,
) -> PageResponse[ExamListItem]:
    views, total = await service.list_exams(
        session,
        current_user,
        page=page,
        page_size=page_size,
        keyword=keyword,
        exam_status=exam_status,
    )
    return PageResponse[ExamListItem](
        items=[
            ExamListItem.from_exam(
                view.exam,
                target=view.target,
                snapshot_question_count=view.snapshot_question_count,
            )
            for view in views
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ExamResponse, status_code=status.HTTP_201_CREATED)
async def create_exam(
    payload: ExamCreate,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> ExamResponse:
    view = await service.create_exam(session, payload, current_user)
    return _response_from_view(view)


@router.get("/{exam_id}", response_model=ExamResponse)
async def get_exam(
    exam_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> ExamResponse:
    view = await service.get_exam(session, exam_id, current_user)
    return _response_from_view(view)


@router.put("/{exam_id}", response_model=ExamResponse)
async def update_exam(
    exam_id: Annotated[int, Path(gt=0)],
    payload: ExamUpdate,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> ExamResponse:
    view = await service.update_exam(session, exam_id, payload, current_user)
    return _response_from_view(view)


@router.put("/{exam_id}/target", response_model=ExamResponse)
async def update_exam_target(
    exam_id: Annotated[int, Path(gt=0)],
    payload: ExamTargetInput,
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> ExamResponse:
    view = await service.update_exam_target(
        session,
        exam_id,
        payload,
        current_user,
    )
    return _response_from_view(view)


@router.post("/{exam_id}/publish", response_model=ExamResponse)
async def publish_exam(
    exam_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> ExamResponse:
    view = await service.publish_exam(session, exam_id, current_user)
    return _response_from_view(view)


@router.get(
    "/{exam_id}/questions",
    response_model=list[ExamQuestionSnapshotResponse],
)
async def list_exam_questions(
    exam_id: Annotated[int, Path(gt=0)],
    session: SessionDependency,
    current_user: TeacherOrAdmin,
) -> list[ExamQuestionSnapshotResponse]:
    snapshots = await service.list_exam_questions(session, exam_id, current_user)
    return [
        ExamQuestionSnapshotResponse.from_snapshot(snapshot)
        for snapshot in snapshots
    ]
