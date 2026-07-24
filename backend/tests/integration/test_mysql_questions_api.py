import asyncio
import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.db.enums import RecordStatus
from app.db.models import Question, QuestionOption, Role, User, UserRole
from app.db.session import AsyncSessionFactory, engine
from app.main import app
from app.modules.auth.security import hash_password

RUN_MYSQL_QUESTION_TESTS = os.getenv("RUN_MYSQL_QUESTION_TESTS") == "1"
ADMIN_USERNAME = "question_api_admin"
TEACHER_USERNAME = "question_api_teacher"
STUDENT_USERNAME = "question_api_student"
TEST_PASSWORD = "Question-API-Test-Password!"


def _single_choice_payload(*, analysis: str = "pwd 显示当前工作目录。") -> dict[str, object]:
    return {
        "question_type": "single_choice",
        "content": "Linux 中查看当前工作目录的命令是什么？",
        "options": [
            {"option_key": "A", "option_content": "pwd", "sort_order": 1},
            {"option_key": "B", "option_content": "cd", "sort_order": 2},
            {"option_key": "C", "option_content": "mkdir", "sort_order": 3},
            {"option_key": "D", "option_content": "touch", "sort_order": 4},
        ],
        "correct_answer": ["A"],
        "analysis": analysis,
        "difficulty": "easy",
    }


def _multiple_choice_payload() -> dict[str, object]:
    return {
        "question_type": "multiple_choice",
        "content": "以下哪些是 Linux 文件操作命令？",
        "options": [
            {"option_key": "A", "option_content": "cp", "sort_order": 1},
            {"option_key": "B", "option_content": "mv", "sort_order": 2},
            {"option_key": "C", "option_content": "Excel", "sort_order": 3},
        ],
        "correct_answer": ["b", "A"],
        "analysis": "cp 和 mv 都可用于文件操作。",
        "difficulty": "medium",
    }


def _true_false_payload() -> dict[str, object]:
    return {
        "question_type": "true_false",
        "content": "Kubernetes 是容器编排系统。",
        "correct_answer": ["true"],
        "analysis": "Kubernetes 用于容器编排。",
        "difficulty": "easy",
    }


@pytest.mark.skipif(
    not RUN_MYSQL_QUESTION_TESTS,
    reason="set RUN_MYSQL_QUESTION_TESTS=1 for the dedicated MySQL question API test",
)
def test_mysql_question_bank_api_flow() -> None:
    async def login(client: AsyncClient, username: str) -> dict[str, str]:
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": TEST_PASSWORD},
        )
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    async def exercise_api_flow() -> None:
        setup_created = False
        try:
            async with AsyncSessionFactory.begin() as session:
                existing_user = await session.scalar(
                    select(User.id).where(
                        User.username.in_([ADMIN_USERNAME, TEACHER_USERNAME, STUDENT_USERNAME])
                    )
                )
                assert existing_user is None

                roles = {
                    role.code: role
                    for role in await session.scalars(
                        select(Role)
                        .where(Role.code.in_(["admin", "teacher", "student"]))
                        .options(selectinload(Role.users))
                    )
                }
                assert set(roles) == {"admin", "teacher", "student"}

                users = [
                    (ADMIN_USERNAME, "题库集成管理员", roles["admin"]),
                    (TEACHER_USERNAME, "题库集成教师", roles["teacher"]),
                    (STUDENT_USERNAME, "题库集成学生", roles["student"]),
                ]
                for username, real_name, role in users:
                    user = User(
                        username=username,
                        password_hash=hash_password(TEST_PASSWORD),
                        real_name=real_name,
                        status=RecordStatus.ACTIVE,
                    )
                    user.role_assignments.append(UserRole(role=role))
                    session.add(user)
            setup_created = True

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                teacher_headers = await login(client, TEACHER_USERNAME)
                admin_headers = await login(client, ADMIN_USERNAME)
                student_headers = await login(client, STUDENT_USERNAME)

                single_response = await client.post(
                    "/api/v1/questions",
                    headers=teacher_headers,
                    json=_single_choice_payload(),
                )
                multiple_response = await client.post(
                    "/api/v1/questions",
                    headers=teacher_headers,
                    json=_multiple_choice_payload(),
                )
                true_false_response = await client.post(
                    "/api/v1/questions",
                    headers=teacher_headers,
                    json=_true_false_payload(),
                )
                assert single_response.status_code == 201
                assert multiple_response.status_code == 201
                assert true_false_response.status_code == 201
                single = single_response.json()
                multiple = multiple_response.json()
                true_false = true_false_response.json()
                assert multiple["correct_answer"] == ["A", "B"]
                assert true_false["options"] == []

                detail_response = await client.get(
                    f"/api/v1/questions/{single['id']}",
                    headers=teacher_headers,
                )
                assert detail_response.status_code == 200
                assert [item["option_key"] for item in detail_response.json()["options"]] == [
                    "A",
                    "B",
                    "C",
                    "D",
                ]

                updated_payload = _single_choice_payload(analysis="更新后的命令解析。")
                update_response = await client.put(
                    f"/api/v1/questions/{single['id']}",
                    headers=teacher_headers,
                    json=updated_payload,
                )
                assert update_response.status_code == 200
                assert update_response.json()["analysis"] == "更新后的命令解析。"

                type_filter_response = await client.get(
                    "/api/v1/questions?question_type=multiple_choice",
                    headers=teacher_headers,
                )
                assert type_filter_response.status_code == 200
                assert [item["id"] for item in type_filter_response.json()["items"]] == [
                    multiple["id"]
                ]

                status_response = await client.patch(
                    f"/api/v1/questions/{true_false['id']}/status",
                    headers=teacher_headers,
                    json={"status": "disabled"},
                )
                disabled_filter_response = await client.get(
                    "/api/v1/questions?status=disabled",
                    headers=teacher_headers,
                )
                assert status_response.status_code == 200
                assert status_response.json()["status"] == "disabled"
                assert true_false["id"] in [
                    item["id"] for item in disabled_filter_response.json()["items"]
                ]

                markdown = """# MySQL Markdown 导入

## 题目
类型：填空题
难度：简单
### 题干
Linux 默认超级用户是 ______。
### 参考答案
root

## 题目
类型：主观问答题
难度：中等
### 题干
请简述容器隔离。
### 参考答案
容器使用 namespace 和 cgroup。

## 题目
类型：判断题
难度：普通
### 题干
这道题应被跳过。
### 正确答案
正确
"""
                preview_response = await client.post(
                    "/api/v1/questions/import/preview",
                    headers=teacher_headers,
                    json={"markdown": markdown},
                )
                import_response = await client.post(
                    "/api/v1/questions/import",
                    headers=teacher_headers,
                    json={"markdown": markdown},
                )
                assert preview_response.status_code == 200
                assert preview_response.json()["valid_count"] == 2
                assert preview_response.json()["invalid_count"] == 1
                assert import_response.status_code == 201
                assert import_response.json()["imported_count"] == 2
                assert import_response.json()["skipped_count"] == 1
                imported_ids = [
                    item["question_id"]
                    for item in import_response.json()["items"]
                    if item["status"] == "imported"
                ]
                async with AsyncSessionFactory() as verification_session:
                    imported_questions = list(
                        await verification_session.scalars(
                            select(Question)
                            .where(Question.id.in_(imported_ids))
                            .options(selectinload(Question.options))
                        )
                    )
                assert len(imported_questions) == 2
                assert all(not question.options for question in imported_questions)
                assert {
                    question.reference_answer for question in imported_questions
                } == {"root", "容器使用 namespace 和 cgroup。"}

                student_response = await client.get(
                    "/api/v1/questions",
                    headers=student_headers,
                )
                assert student_response.status_code == 403

                admin_list_response = await client.get(
                    "/api/v1/questions?page_size=100",
                    headers=admin_headers,
                )
                assert admin_list_response.status_code == 200
                assert {single["id"], multiple["id"], true_false["id"]} <= {
                    item["id"] for item in admin_list_response.json()["items"]
                }

                admin_update_response = await client.put(
                    f"/api/v1/questions/{single['id']}",
                    headers=admin_headers,
                    json=_single_choice_payload(analysis="管理员更新解析。"),
                )
                assert admin_update_response.status_code == 200
                assert admin_update_response.json()["created_by"]["username"] == TEACHER_USERNAME
        finally:
            if setup_created:
                async with AsyncSessionFactory.begin() as session:
                    user_ids = list(
                        await session.scalars(
                            select(User.id).where(
                                User.username.in_(
                                    [ADMIN_USERNAME, TEACHER_USERNAME, STUDENT_USERNAME]
                                )
                            )
                        )
                    )
                    if user_ids:
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
            await engine.dispose()

    asyncio.run(exercise_api_flow())
