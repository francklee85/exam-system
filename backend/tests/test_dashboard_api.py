from datetime import timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.db.enums import RecordStatus
from app.db.mixins import utc_now
from app.db.models import (
    Exam,
    ExamAttempt,
    ExamTarget,
    Major,
    Paper,
    Question,
    Role,
    User,
    UserRole,
)
from app.modules.attempts.enums import (
    AttemptGradingStatus,
    ExamAttemptStatus,
    SubmitReason,
)
from app.modules.exams.enums import ExamStatus, ExamTargetType
from app.modules.papers.enums import PaperStatus
from app.modules.questions.enums import QuestionDifficulty, QuestionType
from tests.test_attempts_api import (
    ADMIN_ID,
    ALL_EXAM_ID,
    CLASS_EXAM_ID,
    CLOUD_MAJOR_ID,
    OTHER_MAJOR_EXAM_ID,
    STUDENT_ID,
    TEACHER_ID,
    _headers,
    _request,
    _run_scenario,
)


def test_dashboard_requires_authentication() -> None:
    assert _request("GET", "/api/v1/dashboard", user_id=None).status_code == 401


def test_admin_dashboard_returns_global_inventory_and_recent_limit() -> None:
    response = _request("GET", "/api/v1/dashboard", user_id=ADMIN_ID)
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "admin"
    assert body["stats"]["user_count"] == 6
    assert body["stats"]["teacher_count"] == 1
    assert body["stats"]["student_count"] == 4
    assert body["stats"]["major_count"] == 2
    assert body["stats"]["paper_count"] == 1
    assert body["stats"]["exam_count"] == 9
    assert len(body["recent_exams"]) == 5
    assert all("target" in exam for exam in body["recent_exams"])


def test_inventory_totals_include_disabled_records() -> None:
    async def scenario(client: AsyncClient, engine: Engine) -> None:
        with Session(engine) as session:
            session.get(Major, CLOUD_MAJOR_ID).status = RecordStatus.DISABLED
            session.commit()
        response = await client.get(
            "/api/v1/dashboard",
            headers=_headers(ADMIN_ID),
        )
        assert response.json()["stats"]["major_count"] == 2

    _run_scenario(scenario)


def test_teacher_dashboard_is_owner_scoped_and_pending_is_not_objective() -> None:
    async def scenario(client: AsyncClient, engine: Engine) -> None:
        now = utc_now()
        with Session(engine) as session:
            teacher_role = session.get(Role, 81)
            other_teacher = User(
                id=20,
                username="other_teacher",
                password_hash="test",
                real_name="其他教师",
                status=RecordStatus.ACTIVE,
                role_assignments=[UserRole(id=20, role=teacher_role)],
            )
            other_teacher.created_questions.append(
                Question(
                    id=700,
                    question_type=QuestionType.TRUE_FALSE,
                    content="其他教师题目",
                    correct_answer=["true"],
                    difficulty=QuestionDifficulty.EASY,
                    status=RecordStatus.ACTIVE,
                )
            )
            other_paper = Paper(
                id=701,
                name="其他教师试卷",
                total_score=Decimal("1.00"),
                status=PaperStatus.ACTIVE,
            )
            other_exam = Exam(
                id=702,
                name="其他教师考试",
                paper=other_paper,
                start_time=now - timedelta(minutes=10),
                end_time=now + timedelta(minutes=60),
                duration_minutes=30,
                pass_score=Decimal("1.00"),
                total_score=Decimal("1.00"),
                status=ExamStatus.PUBLISHED,
                published_at=now,
                targets=[
                    ExamTarget(
                        id=702,
                        target_type=ExamTargetType.ALL,
                        target_id=None,
                    )
                ],
            )
            other_teacher.created_papers.append(other_paper)
            other_teacher.created_exams.append(other_exam)
            session.add_all(
                [
                    other_teacher,
                    ExamAttempt(
                        id=900,
                        exam_id=ALL_EXAM_ID,
                        student_user_id=STUDENT_ID,
                        status=ExamAttemptStatus.SUBMITTED,
                        grading_status=(
                            AttemptGradingStatus.PENDING_MANUAL_GRADING
                        ),
                        started_at=now - timedelta(minutes=30),
                        deadline_at=now + timedelta(minutes=30),
                        submitted_at=now,
                        submit_reason=SubmitReason.MANUAL,
                        objective_score=Decimal("8.00"),
                    ),
                    ExamAttempt(
                        id=901,
                        exam_id=CLASS_EXAM_ID,
                        student_user_id=4,
                        status=ExamAttemptStatus.SUBMITTED,
                        grading_status=AttemptGradingStatus.GRADED,
                        started_at=now - timedelta(minutes=30),
                        deadline_at=now + timedelta(minutes=30),
                        submitted_at=now,
                        submit_reason=SubmitReason.MANUAL,
                        objective_score=Decimal("15.00"),
                        manual_score=Decimal("0.00"),
                        score=Decimal("15.00"),
                        is_passed=True,
                    ),
                    ExamAttempt(
                        id=902,
                        exam=other_exam,
                        student_user_id=5,
                        status=ExamAttemptStatus.SUBMITTED,
                        grading_status=(
                            AttemptGradingStatus.PENDING_MANUAL_GRADING
                        ),
                        started_at=now - timedelta(minutes=20),
                        deadline_at=now + timedelta(minutes=10),
                        submitted_at=now,
                        submit_reason=SubmitReason.MANUAL,
                        objective_score=Decimal("0.00"),
                    ),
                ]
            )
            session.commit()
        response = await client.get(
            "/api/v1/dashboard",
            headers=_headers(TEACHER_ID),
        )
        body = response.json()
        assert body["role"] == "teacher"
        assert body["stats"]["paper_count"] == 1
        assert body["stats"]["exam_count"] == 9
        assert body["stats"]["question_count"] == 0
        assert body["stats"]["pending_grading_count"] == 1
        assert all(
            item["exam_name"] != "其他教师考试"
            for item in body["recent_exams"]
        )
        assert body["pending_grading"] == [
            {
                "exam_id": ALL_EXAM_ID,
                "exam_name": "全部学生考试",
                "pending_attempt_count": 1,
            }
        ]
        assert len(body["recent_exams"]) == 5

    _run_scenario(scenario)


def test_student_dashboard_matches_targets_and_uses_final_scores_only() -> None:
    async def scenario(client: AsyncClient, engine: Engine) -> None:
        now = utc_now()
        with Session(engine) as session:
            session.add_all(
                [
                    ExamAttempt(
                        id=910,
                        exam_id=ALL_EXAM_ID,
                        student_user_id=STUDENT_ID,
                        status=ExamAttemptStatus.SUBMITTED,
                        grading_status=AttemptGradingStatus.GRADED,
                        started_at=now - timedelta(minutes=40),
                        deadline_at=now + timedelta(minutes=20),
                        submitted_at=now - timedelta(minutes=5),
                        submit_reason=SubmitReason.MANUAL,
                        objective_score=Decimal("8.00"),
                        manual_score=Decimal("4.50"),
                        score=Decimal("12.50"),
                        is_passed=True,
                    ),
                    ExamAttempt(
                        id=911,
                        exam_id=CLASS_EXAM_ID,
                        student_user_id=STUDENT_ID,
                        status=ExamAttemptStatus.IN_PROGRESS,
                        grading_status=AttemptGradingStatus.NOT_STARTED,
                        started_at=now - timedelta(minutes=10),
                        deadline_at=now + timedelta(minutes=50),
                    ),
                ]
            )
            session.commit()
        response = await client.get(
            "/api/v1/dashboard",
            headers=_headers(STUDENT_ID),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["role"] == "student"
        assert body["organization"] == {
            "major_name": "云计算",
            "class_name": "云计算2501班",
        }
        assert body["stats"]["in_progress_exam_count"] == 1
        assert body["stats"]["completed_exam_count"] == 1
        assert body["stats"]["graded_exam_count"] == 1
        assert body["stats"]["average_score"] == "12.50"
        visible_ids = {item["exam_id"] for item in body["recent_exams"]}
        assert OTHER_MAJOR_EXAM_ID not in visible_ids
        assert len(body["recent_exams"]) <= 5
        assert body["recent_results"][0]["score"] == "12.50"

        serialized = str(body)
        assert "correct_answer" not in serialized
        assert "reference_answer" not in serialized

    _run_scenario(scenario)


def test_student_without_final_results_has_null_average() -> None:
    response = _request("GET", "/api/v1/dashboard", user_id=STUDENT_ID)
    assert response.status_code == 200
    assert response.json()["stats"]["average_score"] is None
