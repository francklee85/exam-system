import asyncio
import os
from datetime import timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select

from app.db.enums import RecordStatus
from app.db.mixins import utc_now
from app.db.models import (
    Class,
    Exam,
    ExamAnswer,
    ExamAttempt,
    ExamQuestion,
    ExamTarget,
    Major,
    Paper,
    Role,
    StudentProfile,
    User,
    UserRole,
)
from app.db.session import AsyncSessionFactory, engine
from app.main import app
from app.modules.auth.security import hash_password
from app.modules.exams.enums import ExamStatus, ExamTargetType
from app.modules.papers.enums import PaperStatus
from app.modules.questions.enums import QuestionType

RUN_MYSQL_ATTEMPT_TESTS = os.getenv("RUN_MYSQL_ATTEMPT_TESTS") == "1"
TEACHER_USERNAME = "attempt_mysql_teacher"
STUDENT_USERNAME = "attempt_mysql_student"
OTHER_STUDENT_USERNAME = "attempt_mysql_other_student"
TEST_PASSWORD = "Attempt-MySQL-Test-Password!"
MAJOR_CODE = "ATTEMPT_MYSQL_MAJOR"
CLASS_CODE = "ATTEMPT-MYSQL-CLASS"


def _snapshots() -> list[ExamQuestion]:
    return [
        ExamQuestion(
            question_type=QuestionType.SINGLE_CHOICE,
            content="Linux 中查看当前目录的命令？",
            options=[
                {"key": "A", "content": "pwd", "sort_order": 1},
                {"key": "B", "content": "cd", "sort_order": 2},
            ],
            correct_answer=["A"],
            analysis="敏感解析",
            score=Decimal("1.00"),
            sort_order=1,
        ),
        ExamQuestion(
            question_type=QuestionType.MULTIPLE_CHOICE,
            content="选择 Linux 文件系统",
            options=[
                {"key": "A", "content": "ext4", "sort_order": 1},
                {"key": "B", "content": "XFS", "sort_order": 2},
                {"key": "C", "content": "NTFS", "sort_order": 3},
            ],
            correct_answer=["A", "B"],
            analysis="敏感解析",
            score=Decimal("2.00"),
            sort_order=2,
        ),
        ExamQuestion(
            question_type=QuestionType.TRUE_FALSE,
            content="Kubernetes 是容器编排系统。",
            options=None,
            correct_answer=["true"],
            analysis="敏感解析",
            score=Decimal("1.00"),
            sort_order=3,
        ),
        ExamQuestion(
            question_type=QuestionType.FILL_BLANK,
            content="Linux 默认超级用户是 ______。",
            options=None,
            correct_answer=None,
            reference_answer="root（敏感参考答案）",
            analysis="敏感解析",
            score=Decimal("4.00"),
            sort_order=4,
        ),
        ExamQuestion(
            question_type=QuestionType.SUBJECTIVE,
            content="简述容器与虚拟机的区别。",
            options=None,
            correct_answer=None,
            reference_answer="教师主观题参考答案",
            analysis="敏感解析",
            score=Decimal("7.00"),
            sort_order=5,
        ),
    ]


@pytest.mark.skipif(
    not RUN_MYSQL_ATTEMPT_TESTS,
    reason="set RUN_MYSQL_ATTEMPT_TESTS=1 for the dedicated MySQL attempt API test",
)
def test_mysql_student_attempt_and_five_answer_restore_flow() -> None:
    async def login(client: AsyncClient, username: str) -> dict[str, str]:
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": TEST_PASSWORD},
        )
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    async def exercise() -> None:
        created = False
        usernames = [TEACHER_USERNAME, STUDENT_USERNAME, OTHER_STUDENT_USERNAME]
        exam_id: int | None = None
        try:
            async with AsyncSessionFactory.begin() as session:
                assert (
                    await session.scalar(
                        select(User.id).where(User.username.in_(usernames))
                    )
                    is None
                )
                roles = {
                    role.code: role
                    for role in await session.scalars(
                        select(Role).where(Role.code.in_(["teacher", "student"]))
                    )
                }
                assert set(roles) == {"teacher", "student"}
                teacher = User(
                    username=TEACHER_USERNAME,
                    password_hash=hash_password(TEST_PASSWORD),
                    real_name="Attempt 集成教师",
                    status=RecordStatus.ACTIVE,
                )
                teacher.role_assignments.append(UserRole(role=roles["teacher"]))
                student = User(
                    username=STUDENT_USERNAME,
                    password_hash=hash_password(TEST_PASSWORD),
                    real_name="Attempt 集成学生",
                    status=RecordStatus.ACTIVE,
                )
                student.role_assignments.append(UserRole(role=roles["student"]))
                other_student = User(
                    username=OTHER_STUDENT_USERNAME,
                    password_hash=hash_password(TEST_PASSWORD),
                    real_name="Attempt 其他学生",
                    status=RecordStatus.ACTIVE,
                )
                other_student.role_assignments.append(UserRole(role=roles["student"]))
                major = Major(
                    name="Attempt 集成专业",
                    code=MAJOR_CODE,
                    status=RecordStatus.ACTIVE,
                )
                target_class = Class(
                    major=major,
                    name="Attempt 集成2501班",
                    code=CLASS_CODE,
                    enrollment_year=2025,
                    status=RecordStatus.ACTIVE,
                )
                student.student_profile = StudentProfile(
                    student_no="ATTEMPT-MYSQL-001",
                    student_class=target_class,
                )
                other_student.student_profile = StudentProfile(
                    student_no="ATTEMPT-MYSQL-002",
                    student_class=target_class,
                )
                session.add_all([teacher, student, other_student])
                await session.flush()
                paper = Paper(
                    name="Attempt 五题型快照试卷",
                    total_score=Decimal("15.00"),
                    status=PaperStatus.ACTIVE,
                    created_by=teacher.id,
                )
                session.add(paper)
                await session.flush()
                now = utc_now()
                exam = Exam(
                    name="Attempt 五题型考试",
                    paper=paper,
                    start_time=now - timedelta(minutes=5),
                    end_time=now + timedelta(minutes=30),
                    duration_minutes=90,
                    pass_score=Decimal("9.00"),
                    total_score=Decimal("15.00"),
                    status=ExamStatus.PUBLISHED,
                    published_at=now - timedelta(minutes=10),
                    created_by=teacher.id,
                    targets=[
                        ExamTarget(
                            target_type=ExamTargetType.CLASS,
                            target_id=target_class.id,
                        )
                    ],
                    snapshot_questions=_snapshots(),
                )
                session.add(exam)
                await session.flush()
                exam_id = exam.id
            created = True
            assert exam_id is not None

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                student_headers = await login(client, STUDENT_USERNAME)
                other_headers = await login(client, OTHER_STUDENT_USERNAME)
                teacher_headers = await login(client, TEACHER_USERNAME)

                listing = await client.get("/api/v1/my-exams", headers=student_headers)
                assert listing.status_code == 200
                assert exam_id in {
                    item["exam_id"] for item in listing.json()["items"]
                }

                started = await client.post(
                    f"/api/v1/my-exams/{exam_id}/start",
                    headers=student_headers,
                )
                repeated = await client.post(
                    f"/api/v1/my-exams/{exam_id}/start",
                    headers=student_headers,
                )
                assert started.status_code == repeated.status_code == 200
                attempt_id = started.json()["attempt_id"]
                assert repeated.json()["attempt_id"] == attempt_id
                exam_item = next(
                    item
                    for item in listing.json()["items"]
                    if item["exam_id"] == exam_id
                )
                assert started.json()["deadline_at"] <= exam_item["end_time"]
                assert len(started.json()["questions"]) == 5
                assert "correct_answer" not in started.text
                assert "reference_answer" not in started.text
                assert "analysis" not in started.text

                question_ids = [
                    item["exam_question_id"] for item in started.json()["questions"]
                ]
                payloads = [
                    ["A"],
                    ["A"],
                    ["true"],
                    ["root"],
                    ["容器共享宿主机内核，虚拟机包含完整客户机系统。"],
                ]
                for question_id, answer in zip(question_ids, payloads, strict=True):
                    saved = await client.put(
                        f"/api/v1/attempts/{attempt_id}/answers/{question_id}",
                        headers=student_headers,
                        json={"answer": answer},
                    )
                    assert saved.status_code == 200

                updated_multi = await client.put(
                    f"/api/v1/attempts/{attempt_id}/answers/{question_ids[1]}",
                    headers=student_headers,
                    json={"answer": ["B", "A"]},
                )
                assert updated_multi.status_code == 200
                assert updated_multi.json()["answer"] == ["A", "B"]

                restored = await client.get(
                    f"/api/v1/attempts/{attempt_id}",
                    headers=student_headers,
                )
                assert restored.status_code == 200
                assert [
                    item["saved_answer"] for item in restored.json()["questions"]
                ] == [
                    ["A"],
                    ["A", "B"],
                    ["true"],
                    ["root"],
                    ["容器共享宿主机内核，虚拟机包含完整客户机系统。"],
                ]
                assert "reference_answer" not in restored.text

                submitted = await client.post(
                    f"/api/v1/attempts/{attempt_id}/submit",
                    headers=student_headers,
                )
                assert submitted.status_code == 200
                assert submitted.json()["grading_status"] == "pending_manual_grading"
                assert Decimal(submitted.json()["objective_score"]) == Decimal("4.00")
                assert submitted.json()["score"] is None

                grading_detail = await client.get(
                    f"/api/v1/grading/attempts/{attempt_id}",
                    headers=teacher_headers,
                )
                assert grading_detail.status_code == 200
                assert len(grading_detail.json()["answers"]) == 2
                assert "教师主观题参考答案" in grading_detail.text
                fill_graded = await client.put(
                    f"/api/v1/grading/attempts/{attempt_id}/answers/{question_ids[3]}",
                    headers=teacher_headers,
                    json={
                        "score_awarded": "3.50",
                        "grading_comment": "填空评分",
                    },
                )
                assert fill_graded.json()["grading_status"] == (
                    "pending_manual_grading"
                )
                subjective_graded = await client.put(
                    f"/api/v1/grading/attempts/{attempt_id}/answers/{question_ids[4]}",
                    headers=teacher_headers,
                    json={
                        "score_awarded": "6.00",
                        "grading_comment": "主观评分",
                    },
                )
                assert subjective_graded.json()["grading_status"] == "graded"
                assert Decimal(subjective_graded.json()["score"]) == Decimal("13.50")
                assert subjective_graded.json()["is_passed"] is True

                my_results = await client.get(
                    "/api/v1/my-results",
                    headers=student_headers,
                )
                assert my_results.status_code == 200
                assert Decimal(my_results.json()["items"][0]["score"]) == Decimal(
                    "13.50"
                )
                exam_results = await client.get(
                    f"/api/v1/exams/{exam_id}/results",
                    headers=teacher_headers,
                )
                assert exam_results.status_code == 200
                assert exam_results.json()["summary"]["graded_count"] == 1

                forbidden = await client.get(
                    f"/api/v1/attempts/{attempt_id}",
                    headers=other_headers,
                )
                assert forbidden.status_code == 404

                concurrent_starts = await asyncio.gather(
                    client.post(
                        f"/api/v1/my-exams/{exam_id}/start",
                        headers=other_headers,
                    ),
                    client.post(
                        f"/api/v1/my-exams/{exam_id}/start",
                        headers=other_headers,
                    ),
                )
                assert all(response.status_code == 200 for response in concurrent_starts)
                assert len(
                    {response.json()["attempt_id"] for response in concurrent_starts}
                ) == 1

                async with AsyncSessionFactory() as session:
                    primary_attempt_count = (
                        await session.scalar(
                            select(func.count(ExamAttempt.id)).where(
                                ExamAttempt.exam_id == exam_id,
                                ExamAttempt.student_user_id
                                == (
                                    select(User.id)
                                    .where(User.username == STUDENT_USERNAME)
                                    .scalar_subquery()
                                ),
                            )
                        )
                    )
                    assert primary_attempt_count == 1
                    answers = list(
                        await session.scalars(
                            select(ExamAnswer).where(
                                ExamAnswer.attempt_id == attempt_id
                            )
                        )
                    )
                    assert len(answers) == 5
                    objective = [
                        answer
                        for answer in answers
                        if answer.exam_question_id in question_ids[:3]
                    ]
                    manual = [
                        answer
                        for answer in answers
                        if answer.exam_question_id in question_ids[3:]
                    ]
                    assert all(answer.is_correct is True for answer in objective)
                    assert all(answer.score_awarded is not None for answer in answers)
                    assert all(answer.grader_id is None for answer in objective)
                    assert all(answer.grader_id is not None for answer in manual)
        finally:
            if created:
                async with AsyncSessionFactory.begin() as session:
                    user_ids = list(
                        await session.scalars(
                            select(User.id).where(User.username.in_(usernames))
                        )
                    )
                    if exam_id is not None:
                        attempt_ids = list(
                            await session.scalars(
                                select(ExamAttempt.id).where(
                                    ExamAttempt.exam_id == exam_id
                                )
                            )
                        )
                        if attempt_ids:
                            await session.execute(
                                delete(ExamAnswer).where(
                                    ExamAnswer.attempt_id.in_(attempt_ids)
                                )
                            )
                            await session.execute(
                                delete(ExamAttempt).where(
                                    ExamAttempt.id.in_(attempt_ids)
                                )
                            )
                        await session.execute(
                            delete(ExamQuestion).where(
                                ExamQuestion.exam_id == exam_id
                            )
                        )
                        await session.execute(
                            delete(ExamTarget).where(ExamTarget.exam_id == exam_id)
                        )
                        await session.execute(delete(Exam).where(Exam.id == exam_id))
                    if user_ids:
                        paper_ids = list(
                            await session.scalars(
                                select(Paper.id).where(Paper.created_by.in_(user_ids))
                            )
                        )
                        if paper_ids:
                            await session.execute(
                                delete(Paper).where(Paper.id.in_(paper_ids))
                            )
                        await session.execute(
                            delete(StudentProfile).where(
                                StudentProfile.user_id.in_(user_ids)
                            )
                        )
                        await session.execute(
                            delete(UserRole).where(UserRole.user_id.in_(user_ids))
                        )
                        await session.execute(delete(User).where(User.id.in_(user_ids)))
                    await session.execute(delete(Class).where(Class.code == CLASS_CODE))
                    await session.execute(delete(Major).where(Major.code == MAJOR_CODE))
            await engine.dispose()

    asyncio.run(exercise())
