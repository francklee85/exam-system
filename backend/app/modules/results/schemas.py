from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.attempts.enums import (
    AnswerGradingStatus,
    AttemptGradingStatus,
    ExamAttemptStatus,
    SubmitReason,
)
from app.modules.questions.enums import QuestionType


class GradingTaskItem(BaseModel):
    attempt_id: int
    exam_id: int
    exam_name: str
    student_user_id: int
    student_no: str
    student_name: str
    class_name: str
    objective_score: Decimal
    manual_score: Decimal | None
    score: Decimal | None
    grading_status: AttemptGradingStatus
    pending_manual_count: int
    submitted_at: datetime


class ManualGradingAnswer(BaseModel):
    exam_question_id: int
    sort_order: int
    question_type: QuestionType
    content: str
    reference_answer: str | None
    analysis: str | None
    full_score: Decimal
    student_answer: list[str] | None
    score_awarded: Decimal | None
    grading_status: AnswerGradingStatus
    grading_comment: str | None
    grader_id: int | None
    graded_at: datetime | None


class GradingAttemptDetail(BaseModel):
    attempt_id: int
    exam_id: int
    exam_name: str
    student_user_id: int
    student_no: str
    student_name: str
    class_name: str
    objective_score: Decimal
    manual_score: Decimal | None
    score: Decimal | None
    is_passed: bool | None
    grading_status: AttemptGradingStatus
    submitted_at: datetime
    answers: list[ManualGradingAnswer]


class ManualGradeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score_awarded: Decimal = Field(ge=0, max_digits=6, decimal_places=2)
    grading_comment: str | None = Field(default=None, max_length=5000)


class MyResultItem(BaseModel):
    attempt_id: int
    exam_id: int
    exam_name: str
    total_score: Decimal
    pass_score: Decimal
    attempt_status: ExamAttemptStatus
    grading_status: AttemptGradingStatus
    objective_score: Decimal
    manual_score: Decimal | None
    score: Decimal | None
    is_passed: bool | None
    submitted_at: datetime
    submit_reason: SubmitReason


class MyResultDetail(MyResultItem):
    started_at: datetime
    deadline_at: datetime


class ExamResultItem(BaseModel):
    attempt_id: int
    student_user_id: int
    student_no: str
    student_name: str
    class_name: str
    attempt_status: ExamAttemptStatus
    grading_status: AttemptGradingStatus
    objective_score: Decimal | None
    manual_score: Decimal | None
    final_score: Decimal | None
    is_passed: bool | None
    submitted_at: datetime | None
    submit_reason: SubmitReason | None


class ExamResultSummary(BaseModel):
    attempted_count: int
    submitted_count: int
    pending_manual_count: int
    graded_count: int
    passed_count: int


class ExamResultsPage(BaseModel):
    items: list[ExamResultItem]
    total: int
    page: int
    page_size: int
    summary: ExamResultSummary
