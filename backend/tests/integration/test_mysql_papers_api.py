import asyncio
import os
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.enums import RecordStatus
from app.db.models import (
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

RUN_MYSQL_PAPER_TESTS = os.getenv("RUN_MYSQL_PAPER_TESTS") == "1"
ADMIN_USERNAME = "paper_api_admin"
TEACHER_USERNAME = "paper_api_teacher"
STUDENT_USERNAME = "paper_api_student"
TEST_PASSWORD = "Paper-API-Test-Password!"


def _choice_payload(
    content: str,
    *,
    question_type: str = "single_choice",
) -> dict[str, object]:
    return {
        "question_type": question_type,
        "content": content,
        "options": [
            {"option_key": "A", "option_content": "选项 A", "sort_order": 1},
            {"option_key": "B", "option_content": "选项 B", "sort_order": 2},
            {"option_key": "C", "option_content": "选项 C", "sort_order": 3},
        ],
        "correct_answer": ["A", "B"] if question_type == "multiple_choice" else ["A"],
        "analysis": "试卷集成测试解析",
        "difficulty": "easy",
    }


def _true_false_payload(content: str) -> dict[str, object]:
    return {
        "question_type": "true_false",
        "content": content,
        "correct_answer": ["true"],
        "analysis": "试卷集成测试解析",
        "difficulty": "easy",
    }


@pytest.mark.skipif(
    not RUN_MYSQL_PAPER_TESTS,
    reason="set RUN_MYSQL_PAPER_TESTS=1 for the dedicated MySQL paper API test",
)
def test_mysql_manual_paper_composition_flow() -> None:
    async def login(client: AsyncClient, username: str) -> dict[str, str]:
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": TEST_PASSWORD},
        )
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    async def exercise_api_flow() -> None:
        setup_created = False
        usernames = [ADMIN_USERNAME, TEACHER_USERNAME, STUDENT_USERNAME]
        try:
            async with AsyncSessionFactory.begin() as session:
                existing_user = await session.scalar(
                    select(User.id).where(User.username.in_(usernames))
                )
                assert existing_user is None
                roles = {
                    role.code: role
                    for role in await session.scalars(
                        select(Role).where(Role.code.in_(["admin", "teacher", "student"]))
                    )
                }
                assert set(roles) == {"admin", "teacher", "student"}
                for username, real_name, role_code in [
                    (ADMIN_USERNAME, "试卷集成管理员", "admin"),
                    (TEACHER_USERNAME, "试卷集成教师", "teacher"),
                    (STUDENT_USERNAME, "试卷集成学生", "student"),
                ]:
                    user = User(
                        username=username,
                        password_hash=hash_password(TEST_PASSWORD),
                        real_name=real_name,
                        status=RecordStatus.ACTIVE,
                    )
                    user.role_assignments.append(UserRole(role=roles[role_code]))
                    session.add(user)
            setup_created = True

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                teacher_headers = await login(client, TEACHER_USERNAME)
                admin_headers = await login(client, ADMIN_USERNAME)
                student_headers = await login(client, STUDENT_USERNAME)

                question_payloads = [
                    _choice_payload("Linux 中查看当前工作目录的命令是？"),
                    _choice_payload(
                        "以下哪些属于 Linux 常见文件系统？",
                        question_type="multiple_choice",
                    ),
                    _true_false_payload("Kubernetes 是一个容器编排系统。"),
                    _choice_payload("这是一道稍后禁用的题目。"),
                ]
                questions = []
                for payload in question_payloads:
                    response = await client.post(
                        "/api/v1/questions",
                        headers=teacher_headers,
                        json=payload,
                    )
                    assert response.status_code == 201
                    questions.append(response.json())

                disable_response = await client.patch(
                    f"/api/v1/questions/{questions[3]['id']}/status",
                    headers=teacher_headers,
                    json={"status": "disabled"},
                )
                assert disable_response.status_code == 200

                paper_response = await client.post(
                    "/api/v1/papers",
                    headers=teacher_headers,
                    json={
                        "name": "Linux 基础测试",
                        "description": "真实 MySQL 人工组卷验证",
                    },
                )
                assert paper_response.status_code == 201
                paper = paper_response.json()
                assert paper["status"] == "draft"
                assert Decimal(paper["total_score"]) == Decimal("0.00")

                add_response = await client.post(
                    f"/api/v1/papers/{paper['id']}/questions",
                    headers=teacher_headers,
                    json={
                        "items": [
                            {"question_id": questions[0]["id"], "score": "2.00"},
                            {"question_id": questions[1]["id"], "score": "5.00"},
                            {"question_id": questions[2]["id"], "score": "3.00"},
                        ]
                    },
                )
                assert add_response.status_code == 200
                composed = add_response.json()
                assert Decimal(composed["total_score"]) == Decimal("10.00")
                assert [item["sort_order"] for item in composed["questions"]] == [1, 2, 3]

                score_response = await client.patch(
                    f"/api/v1/papers/{paper['id']}/questions/{questions[0]['id']}",
                    headers=teacher_headers,
                    json={"score": "2.50"},
                )
                assert score_response.status_code == 200
                assert Decimal(score_response.json()["total_score"]) == Decimal("10.50")

                item_ids = [
                    item["paper_question_id"] for item in score_response.json()["questions"]
                ]
                reorder_response = await client.put(
                    f"/api/v1/papers/{paper['id']}/questions/order",
                    headers=teacher_headers,
                    json={"paper_question_ids": list(reversed(item_ids))},
                )
                assert reorder_response.status_code == 200
                assert [
                    item["paper_question_id"] for item in reorder_response.json()["questions"]
                ] == list(reversed(item_ids))

                remove_response = await client.delete(
                    f"/api/v1/papers/{paper['id']}/questions/{questions[2]['id']}",
                    headers=teacher_headers,
                )
                assert remove_response.status_code == 200
                assert Decimal(remove_response.json()["total_score"]) == Decimal("7.50")
                assert [item["sort_order"] for item in remove_response.json()["questions"]] == [
                    1,
                    2,
                ]

                disabled_add_response = await client.post(
                    f"/api/v1/papers/{paper['id']}/questions",
                    headers=teacher_headers,
                    json={
                        "items": [
                            {"question_id": questions[3]["id"], "score": "1.00"}
                        ]
                    },
                )
                assert disabled_add_response.status_code == 409

                activate_response = await client.patch(
                    f"/api/v1/papers/{paper['id']}/status",
                    headers=teacher_headers,
                    json={"status": "active"},
                )
                assert activate_response.status_code == 200

                locked_add_response = await client.post(
                    f"/api/v1/papers/{paper['id']}/questions",
                    headers=teacher_headers,
                    json={
                        "items": [
                            {"question_id": questions[2]["id"], "score": "3.00"}
                        ]
                    },
                )
                assert locked_add_response.status_code == 409

                student_response = await client.get(
                    "/api/v1/papers",
                    headers=student_headers,
                )
                assert student_response.status_code == 403

                admin_response = await client.get(
                    f"/api/v1/papers/{paper['id']}",
                    headers=admin_headers,
                )
                assert admin_response.status_code == 200
                assert admin_response.json()["creator"]["username"] == TEACHER_USERNAME
                assert Decimal(admin_response.json()["total_score"]) == Decimal("7.50")
        finally:
            if setup_created:
                async with AsyncSessionFactory.begin() as session:
                    user_ids = list(
                        await session.scalars(
                            select(User.id).where(User.username.in_(usernames))
                        )
                    )
                    if user_ids:
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
                async with AsyncSessionFactory() as session:
                    remaining_user = await session.scalar(
                        select(User.id).where(User.username.in_(usernames))
                    )
                    assert remaining_user is None
            await engine.dispose()

    asyncio.run(exercise_api_flow())
