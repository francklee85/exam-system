from datetime import datetime
from decimal import Decimal
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field

from app.modules.attempts.enums import (
    AttemptGradingStatus,
    ExamAttemptStatus,
    SubmitReason,
)
from app.modules.exams.enums import ExamRuntimeStatus, ExamStatus
from app.modules.exams.models import ExamQuestion
from app.modules.questions.enums import QuestionType

AnswerValue = Annotated[str, Field(max_length=20_000)]


class StudentExamOptionResponse(BaseModel):
    key: str
    content: str
    sort_order: int


class StudentExamQuestionResponse(BaseModel):
    """Safe student view; answer keys, references and analysis are intentionally absent."""

    exam_question_id: int
    question_type: QuestionType
    content: str
    options: list[StudentExamOptionResponse] | None
    score: Decimal
    sort_order: int
    saved_answer: list[str] | None

    @classmethod
    def from_snapshot(
        cls,
        snapshot: ExamQuestion,
        *,
        saved_answer: list[str] | None,
    ) -> Self:
        return cls(
            exam_question_id=snapshot.id,
            question_type=snapshot.question_type,
            content=snapshot.content,
            options=(
                [
                    StudentExamOptionResponse.model_validate(option)
                    for option in snapshot.options
                ]
                if snapshot.options is not None
                else None
            ),
            score=snapshot.score,
            sort_order=snapshot.sort_order,
            saved_answer=saved_answer,
        )


class MyExamListItem(BaseModel):
    exam_id: int
    name: str
    description: str | None
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    total_score: Decimal
    pass_score: Decimal
    status: ExamStatus
    runtime_status: ExamRuntimeStatus
    attempt_id: int | None
    attempt_status: ExamAttemptStatus | None
    started_at: datetime | None
    deadline_at: datetime | None


class MyExamDetail(MyExamListItem):
    published_at: datetime | None


class ExamAttemptResponse(BaseModel):
    attempt_id: int
    exam_id: int
    exam_name: str
    status: ExamAttemptStatus
    grading_status: AttemptGradingStatus
    started_at: datetime
    deadline_at: datetime
    submitted_at: datetime | None
    submit_reason: SubmitReason | None
    objective_score: Decimal | None
    manual_score: Decimal | None
    score: Decimal | None
    is_passed: bool | None
    server_time: datetime
    questions: list[StudentExamQuestionResponse]


class AttemptSubmissionResponse(BaseModel):
    attempt_id: int
    status: ExamAttemptStatus
    grading_status: AttemptGradingStatus
    submitted_at: datetime
    submit_reason: SubmitReason
    objective_score: Decimal
    manual_score: Decimal | None
    score: Decimal | None
    is_passed: bool | None


class AnswerSaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: list[AnswerValue] | None = Field(default=None, max_length=100)


class SavedAnswerResponse(BaseModel):
    exam_question_id: int
    answer: list[str] | None
    answered_at: datetime
