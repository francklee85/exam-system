from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.modules.attempts.enums import AttemptGradingStatus, ExamAttemptStatus
from app.modules.exams.enums import ExamRuntimeStatus, ExamTargetType


class DashboardExamTarget(BaseModel):
    type: ExamTargetType | None
    id: int | None
    name: str


class DashboardRecentExam(BaseModel):
    exam_id: int
    exam_name: str
    runtime_status: ExamRuntimeStatus
    start_time: datetime
    end_time: datetime
    creator_name: str
    target: DashboardExamTarget


class PendingGradingExam(BaseModel):
    exam_id: int
    exam_name: str
    pending_attempt_count: int


class AdminDashboardStats(BaseModel):
    user_count: int
    teacher_count: int
    student_count: int
    major_count: int
    class_count: int
    question_count: int
    paper_count: int
    exam_count: int
    in_progress_exam_count: int
    pending_grading_count: int


class TeacherDashboardStats(BaseModel):
    question_count: int
    paper_count: int
    exam_count: int
    in_progress_exam_count: int
    pending_grading_count: int


class StudentDashboardStats(BaseModel):
    pending_exam_count: int
    in_progress_exam_count: int
    completed_exam_count: int
    graded_exam_count: int
    average_score: Decimal | None


class StudentOrganizationSummary(BaseModel):
    major_name: str
    class_name: str


class StudentDashboardExam(BaseModel):
    exam_id: int
    exam_name: str
    runtime_status: ExamRuntimeStatus
    start_time: datetime
    end_time: datetime
    deadline_at: datetime | None
    attempt_id: int | None
    attempt_status: ExamAttemptStatus | None
    grading_status: AttemptGradingStatus | None
    action_type: Literal["start", "continue", "view_result", "unavailable"]


class StudentRecentResult(BaseModel):
    attempt_id: int
    exam_id: int
    exam_name: str
    total_score: Decimal
    score: Decimal | None
    is_passed: bool | None
    grading_status: AttemptGradingStatus
    submitted_at: datetime


class AdminDashboardData(BaseModel):
    role: Literal["admin"] = "admin"
    stats: AdminDashboardStats
    recent_exams: list[DashboardRecentExam]


class TeacherDashboardData(BaseModel):
    role: Literal["teacher"] = "teacher"
    stats: TeacherDashboardStats
    recent_exams: list[DashboardRecentExam]
    pending_grading: list[PendingGradingExam]


class StudentDashboardData(BaseModel):
    role: Literal["student"] = "student"
    organization: StudentOrganizationSummary
    stats: StudentDashboardStats
    recent_exams: list[StudentDashboardExam]
    recent_results: list[StudentRecentResult]


DashboardResponse = Annotated[
    AdminDashboardData | TeacherDashboardData | StudentDashboardData,
    Field(discriminator="role"),
]
