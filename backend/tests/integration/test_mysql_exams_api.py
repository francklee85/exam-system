import asyncio
import os
from datetime import timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.enums import RecordStatus
from app.db.mixins import utc_now
from app.db.models import (
    Class,
    Exam,
    ExamQuestion,
    ExamTarget,
    Major,
    Paper,
    PaperQuestion,
    Question,
    QuestionOption,
    Role,
    User,
    UserRole,
)
from app.db.session import AsyncSessionFactory, engine
from app.main import app
from app.modules.auth.security import hash_password

RUN_MYSQL_EXAM_TESTS = os.getenv("RUN_MYSQL_EXAM_TESTS") == "1"
ADMIN_USERNAME = "exam_api_admin"
TEACHER_USERNAME = "exam_api_teacher"
STUDENT_USERNAME = "exam_api_student"
TEST_PASSWORD = "Exam-API-Test-Password!"
MAJOR_CODE = "EXAM_API_MAJOR"
CLASS_CODE = "EXAM-API-CLASS"


def _choice_payload(
    content: str,
    *,
    multiple: bool = False,
) -> dict[str, object]:
    return {
        "question_type": "multiple_choice" if multiple else "single_choice",
        "content": content,
        "options": [
            {"option_key": "A", "option_content": "选项 A", "sort_order": 1},
            {"option_key": "B", "option_content": "选项 B", "sort_order": 2},
            {"option_key": "C", "option_content": "选项 C", "sort_order": 3},
        ],
        "correct_answer": ["A", "B"] if multiple else ["A"],
        "analysis": f"{content}解析",
        "difficulty": "easy",
    }


def _true_false_payload(content: str) -> dict[str, object]:
    return {
        "question_type": "true_false",
        "content": content,
        "options": [],
        "correct_answer": ["true"],
        "analysis": f"{content}解析",
        "difficulty": "easy",
    }


@pytest.mark.skipif(
    not RUN_MYSQL_EXAM_TESTS,
    reason="set RUN_MYSQL_EXAM_TESTS=1 for the dedicated MySQL exam API test",
)
def test_mysql_exam_publish_and_snapshot_flow() -> None:
    async def login(client: AsyncClient, username: str) -> dict[str, str]:
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": TEST_PASSWORD},
        )
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    async def exercise() -> None:
        setup_created = False
        usernames = [ADMIN_USERNAME, TEACHER_USERNAME, STUDENT_USERNAME]
        try:
            async with AsyncSessionFactory.begin() as session:
                assert (
                    await session.scalar(
                        select(User.id).where(User.username.in_(usernames))
                    )
                    is None
                )
                assert (
                    await session.scalar(select(Major.id).where(Major.code == MAJOR_CODE))
                    is None
                )
                roles = {
                    role.code: role
                    for role in await session.scalars(
                        select(Role).where(Role.code.in_(["admin", "teacher", "student"]))
                    )
                }
                assert set(roles) == {"admin", "teacher", "student"}
                users: dict[str, User] = {}
                for username, real_name, role_code in [
                    (ADMIN_USERNAME, "考试集成管理员", "admin"),
                    (TEACHER_USERNAME, "考试集成教师", "teacher"),
                    (STUDENT_USERNAME, "考试集成学生", "student"),
                ]:
                    user = User(
                        username=username,
                        password_hash=hash_password(TEST_PASSWORD),
                        real_name=real_name,
                        status=RecordStatus.ACTIVE,
                    )
                    user.role_assignments.append(UserRole(role=roles[role_code]))
                    session.add(user)
                    users[role_code] = user
                major = Major(
                    name="考试集成专业",
                    code=MAJOR_CODE,
                    status=RecordStatus.ACTIVE,
                )
                target_class = Class(
                    major=major,
                    name="考试集成2501班",
                    code=CLASS_CODE,
                    enrollment_year=2025,
                    status=RecordStatus.ACTIVE,
                )
                session.add(target_class)
            setup_created = True

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                teacher_headers = await login(client, TEACHER_USERNAME)
                admin_headers = await login(client, ADMIN_USERNAME)
                student_headers = await login(client, STUDENT_USERNAME)

                question_payloads = [
                    _choice_payload("Linux 中查看当前目录的命令？"),
                    _choice_payload("哪些属于 Linux 文件系统？", multiple=True),
                    _true_false_payload("Kubernetes 是容器编排系统。"),
                ]
                questions: list[dict[str, object]] = []
                for payload in question_payloads:
                    response = await client.post(
                        "/api/v1/questions",
                        headers=teacher_headers,
                        json=payload,
                    )
                    assert response.status_code == 201
                    questions.append(response.json())

                paper_response = await client.post(
                    "/api/v1/papers",
                    headers=teacher_headers,
                    json={
                        "name": "Linux 综合测试",
                        "description": "考试发布集成测试试卷",
                    },
                )
                assert paper_response.status_code == 201
                paper = paper_response.json()
                add_response = await client.post(
                    f"/api/v1/papers/{paper['id']}/questions",
                    headers=teacher_headers,
                    json={
                        "items": [
                            {"question_id": questions[0]["id"], "score": "2.50"},
                            {"question_id": questions[1]["id"], "score": "5.00"},
                            {"question_id": questions[2]["id"], "score": "2.50"},
                        ]
                    },
                )
                assert add_response.status_code == 200
                assert Decimal(add_response.json()["total_score"]) == Decimal("10.00")
                activate = await client.patch(
                    f"/api/v1/papers/{paper['id']}/status",
                    headers=teacher_headers,
                    json={"status": "active"},
                )
                assert activate.status_code == 200

                # Disabling a source question after paper activation does not invalidate
                # the already finalized active paper during exam publication.
                disable_source = await client.patch(
                    f"/api/v1/questions/{questions[2]['id']}/status",
                    headers=teacher_headers,
                    json={"status": "disabled"},
                )
                assert disable_source.status_code == 200

                async with AsyncSessionFactory() as session:
                    target_class_id = await session.scalar(
                        select(Class.id).where(Class.code == CLASS_CODE)
                    )
                    assert target_class_id is not None

                start_time = utc_now() + timedelta(days=7)
                end_time = start_time + timedelta(hours=2)
                exam_response = await client.post(
                    "/api/v1/exams",
                    headers=teacher_headers,
                    json={
                        "name": "2026 云计算 Linux 阶段考试",
                        "paper_id": paper["id"],
                        "description": "真实 MySQL 考试发布验证",
                        "start_time": start_time.isoformat(),
                        "end_time": end_time.isoformat(),
                        "duration_minutes": 90,
                        "pass_score": "6.00",
                        "target": {
                            "target_type": "class",
                            "target_id": target_class_id,
                        },
                    },
                )
                assert exam_response.status_code == 201
                exam = exam_response.json()
                assert exam["status"] == "draft"
                assert exam["target"]["name"] == "考试集成2501班"

                publish_response = await client.post(
                    f"/api/v1/exams/{exam['id']}/publish",
                    headers=teacher_headers,
                )
                assert publish_response.status_code == 200
                published = publish_response.json()
                assert published["status"] == "published"
                assert published["runtime_status"] == "not_started"
                assert published["published_at"] is not None
                assert Decimal(published["total_score"]) == Decimal("10.00")
                assert published["snapshot_question_count"] == 3

                snapshots_response = await client.get(
                    f"/api/v1/exams/{exam['id']}/questions",
                    headers=teacher_headers,
                )
                assert snapshots_response.status_code == 200
                snapshots_before = snapshots_response.json()
                assert len(snapshots_before) == 3
                assert [item["sort_order"] for item in snapshots_before] == [1, 2, 3]
                assert [Decimal(item["score"]) for item in snapshots_before] == [
                    Decimal("2.50"),
                    Decimal("5.00"),
                    Decimal("2.50"),
                ]
                assert snapshots_before[0]["options"][0]["key"] == "A"
                assert snapshots_before[0]["correct_answer"] == ["A"]

                modified_payload = _choice_payload("原题修改后的题干")
                modified_payload["correct_answer"] = ["B"]
                update_source = await client.put(
                    f"/api/v1/questions/{questions[0]['id']}",
                    headers=teacher_headers,
                    json=modified_payload,
                )
                assert update_source.status_code == 200

                to_draft = await client.patch(
                    f"/api/v1/papers/{paper['id']}/status",
                    headers=teacher_headers,
                    json={"status": "draft"},
                )
                assert to_draft.status_code == 200
                score_update = await client.patch(
                    f"/api/v1/papers/{paper['id']}/questions/{questions[0]['id']}",
                    headers=teacher_headers,
                    json={"score": "3.50"},
                )
                assert score_update.status_code == 200
                item_ids = [
                    item["paper_question_id"]
                    for item in score_update.json()["questions"]
                ]
                reorder = await client.put(
                    f"/api/v1/papers/{paper['id']}/questions/order",
                    headers=teacher_headers,
                    json={"paper_question_ids": list(reversed(item_ids))},
                )
                assert reorder.status_code == 200

                snapshots_after = await client.get(
                    f"/api/v1/exams/{exam['id']}/questions",
                    headers=teacher_headers,
                )
                exam_after = await client.get(
                    f"/api/v1/exams/{exam['id']}",
                    headers=teacher_headers,
                )
                assert snapshots_after.json() == snapshots_before
                assert Decimal(exam_after.json()["total_score"]) == Decimal("10.00")

                repeated = await client.post(
                    f"/api/v1/exams/{exam['id']}/publish",
                    headers=teacher_headers,
                )
                assert repeated.status_code == 409
                assert len(
                    (
                        await client.get(
                            f"/api/v1/exams/{exam['id']}/questions",
                            headers=teacher_headers,
                        )
                    ).json()
                ) == 3

                locked_update = await client.put(
                    f"/api/v1/exams/{exam['id']}",
                    headers=teacher_headers,
                    json={
                        "name": "禁止修改",
                        "paper_id": paper["id"],
                        "description": None,
                        "start_time": start_time.isoformat(),
                        "end_time": end_time.isoformat(),
                        "duration_minutes": 60,
                        "pass_score": "5.00",
                        "target": {"target_type": "all", "target_id": None},
                    },
                )
                assert locked_update.status_code == 409

                student_response = await client.get(
                    "/api/v1/exams",
                    headers=student_headers,
                )
                assert student_response.status_code == 403
                admin_response = await client.get(
                    f"/api/v1/exams/{exam['id']}",
                    headers=admin_headers,
                )
                assert admin_response.status_code == 200
                assert admin_response.json()["creator"]["username"] == TEACHER_USERNAME
        finally:
            if setup_created:
                async with AsyncSessionFactory.begin() as session:
                    user_ids = list(
                        await session.scalars(
                            select(User.id).where(User.username.in_(usernames))
                        )
                    )
                    if user_ids:
                        exam_ids = list(
                            await session.scalars(
                                select(Exam.id).where(Exam.created_by.in_(user_ids))
                            )
                        )
                        if exam_ids:
                            await session.execute(
                                delete(ExamQuestion).where(
                                    ExamQuestion.exam_id.in_(exam_ids)
                                )
                            )
                            await session.execute(
                                delete(ExamTarget).where(ExamTarget.exam_id.in_(exam_ids))
                            )
                            await session.execute(delete(Exam).where(Exam.id.in_(exam_ids)))
                        paper_ids = list(
                            await session.scalars(
                                select(Paper.id).where(Paper.created_by.in_(user_ids))
                            )
                        )
                        if paper_ids:
                            await session.execute(
                                delete(PaperQuestion).where(
                                    PaperQuestion.paper_id.in_(paper_ids)
                                )
                            )
                            await session.execute(delete(Paper).where(Paper.id.in_(paper_ids)))
                        question_ids = list(
                            await session.scalars(
                                select(Question.id).where(Question.created_by.in_(user_ids))
                            )
                        )
                        if question_ids:
                            await session.execute(
                                delete(QuestionOption).where(
                                    QuestionOption.question_id.in_(question_ids)
                                )
                            )
                            await session.execute(
                                delete(Question).where(Question.id.in_(question_ids))
                            )
                        await session.execute(
                            delete(UserRole).where(UserRole.user_id.in_(user_ids))
                        )
                        await session.execute(delete(User).where(User.id.in_(user_ids)))
                    class_ids = list(
                        await session.scalars(
                            select(Class.id).where(Class.code == CLASS_CODE)
                        )
                    )
                    if class_ids:
                        await session.execute(delete(Class).where(Class.id.in_(class_ids)))
                    await session.execute(delete(Major).where(Major.code == MAJOR_CODE))
                async with AsyncSessionFactory() as session:
                    assert (
                        await session.scalar(
                            select(User.id).where(User.username.in_(usernames))
                        )
                        is None
                    )
                    assert (
                        await session.scalar(
                            select(Major.id).where(Major.code == MAJOR_CODE)
                        )
                        is None
                    )
            await engine.dispose()

    asyncio.run(exercise())
