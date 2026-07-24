from datetime import UTC, datetime
from decimal import Decimal
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.db.mixins import utc_now
from app.modules.exams.enums import (
    ExamRuntimeStatus,
    ExamStatus,
    ExamTargetType,
    calculate_runtime_status,
)
from app.modules.exams.models import Exam, ExamQuestion
from app.modules.papers.enums import PaperStatus
from app.modules.questions.enums import QuestionType


class ExamTargetInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_type: ExamTargetType
    target_id: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_target_id(self) -> Self:
        if self.target_type == ExamTargetType.ALL and self.target_id is not None:
            raise ValueError("全部学生考试对象的 target_id 必须为空")
        if self.target_type != ExamTargetType.ALL and self.target_id is None:
            raise ValueError("专业或班级考试对象必须提供 target_id")
        return self


class ExamWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    paper_id: int = Field(gt=0)
    description: str | None = None
    start_time: datetime
    end_time: datetime
    duration_minutes: int = Field(gt=0)
    pass_score: Decimal = Field(ge=0, max_digits=6, decimal_places=2)
    target: ExamTargetInput | None = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("start_time", "end_time", mode="after")
    @classmethod
    def normalize_datetime(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value
        return value.astimezone(UTC).replace(tzinfo=None)

    @model_validator(mode="after")
    def validate_time_range(self) -> Self:
        if self.start_time >= self.end_time:
            raise ValueError("开始时间必须早于结束时间")
        return self


class ExamCreate(ExamWrite):
    pass


class ExamUpdate(ExamWrite):
    pass


class ExamCreatorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    real_name: str


class ExamPaperSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    status: PaperStatus


class ExamTargetResponse(BaseModel):
    type: ExamTargetType
    id: int | None
    name: str


class ExamListItem(BaseModel):
    id: int
    name: str
    description: str | None
    paper: ExamPaperSummary
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    pass_score: Decimal
    total_score: Decimal
    status: ExamStatus
    runtime_status: ExamRuntimeStatus
    target: ExamTargetResponse | None
    creator: ExamCreatorResponse
    snapshot_question_count: int
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_exam(
        cls,
        exam: Exam,
        *,
        target: ExamTargetResponse | None,
        snapshot_question_count: int,
        now: datetime | None = None,
    ) -> Self:
        return cls(
            id=exam.id,
            name=exam.name,
            description=exam.description,
            paper=ExamPaperSummary.model_validate(exam.paper),
            start_time=exam.start_time,
            end_time=exam.end_time,
            duration_minutes=exam.duration_minutes,
            pass_score=exam.pass_score,
            total_score=exam.total_score,
            status=exam.status,
            runtime_status=calculate_runtime_status(
                exam.status,
                exam.start_time,
                exam.end_time,
                now=now or utc_now(),
            ),
            target=target,
            creator=ExamCreatorResponse.model_validate(exam.creator),
            snapshot_question_count=snapshot_question_count,
            published_at=exam.published_at,
            created_at=exam.created_at,
            updated_at=exam.updated_at,
        )


class ExamResponse(ExamListItem):
    pass


class ExamSnapshotOptionResponse(BaseModel):
    key: str
    content: str
    sort_order: int


class ExamQuestionSnapshotResponse(BaseModel):
    id: int
    original_question_id: int | None
    question_type: QuestionType
    content: str
    options: list[ExamSnapshotOptionResponse] | None
    correct_answer: list[str] | None
    reference_answer: str | None
    analysis: str | None
    score: Decimal
    sort_order: int
    created_at: datetime

    @classmethod
    def from_snapshot(cls, snapshot: ExamQuestion) -> Self:
        return cls(
            id=snapshot.id,
            original_question_id=snapshot.original_question_id,
            question_type=snapshot.question_type,
            content=snapshot.content,
            options=(
                [
                    ExamSnapshotOptionResponse.model_validate(option)
                    for option in snapshot.options
                ]
                if snapshot.options is not None
                else None
            ),
            correct_answer=snapshot.correct_answer,
            reference_answer=snapshot.reference_answer,
            analysis=snapshot.analysis,
            score=snapshot.score,
            sort_order=snapshot.sort_order,
            created_at=snapshot.created_at,
        )
