import asyncio
from collections.abc import AsyncIterator
from typing import cast

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import Select, create_engine, select
from sqlalchemy.engine import ScalarResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.enums import RecordStatus
from app.db.models import (
    Base,
    Question,
    QuestionOption,
    Role,
    User,
    UserRole,
)
from app.db.session import get_db_session
from app.main import app
from app.modules.auth.security import create_access_token
from app.modules.questions.enums import QuestionDifficulty, QuestionType

ADMIN_USER_ID = 1
TEACHER_USER_ID = 2
STUDENT_USER_ID = 3
OTHER_TEACHER_USER_ID = 4


class AsyncSessionAdapter:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._next_question_id = 1000
        self._next_option_id = 2000

    def add(self, instance: object) -> None:
        if isinstance(instance, Question):
            if instance.id is None:
                instance.id = self._next_question_id
                self._next_question_id += 1
            for option in instance.options:
                self._assign_option_id(option)
        if isinstance(instance, QuestionOption):
            self._assign_option_id(instance)
        self._session.add(instance)

    def _assign_option_id(self, option: QuestionOption) -> None:
        if option.id is None:
            option.id = self._next_option_id
            self._next_option_id += 1

    async def scalar(self, statement: Select[tuple[object]]) -> object | None:
        return self._session.scalar(statement)

    async def scalars(self, statement: Select[tuple[object]]) -> ScalarResult[object]:
        return self._session.scalars(statement)

    async def flush(self) -> None:
        self._session.flush()

    async def commit(self) -> None:
        self._session.commit()

    async def rollback(self) -> None:
        self._session.rollback()


def _user(
    *,
    user_id: int,
    username: str,
    role: Role,
    assignment_id: int,
) -> User:
    user = User(
        id=user_id,
        username=username,
        password_hash="test-password-hash",
        real_name=username,
        status=RecordStatus.ACTIVE,
    )
    user.role_assignments.append(UserRole(id=assignment_id, role=role))
    return user


def _seed_test_data(session: Session) -> None:
    admin_role = Role(id=90, code="admin", name="管理员", status=RecordStatus.ACTIVE)
    teacher_role = Role(id=91, code="teacher", name="教师", status=RecordStatus.ACTIVE)
    student_role = Role(id=92, code="student", name="学生", status=RecordStatus.ACTIVE)

    admin = _user(
        user_id=ADMIN_USER_ID,
        username="admin",
        role=admin_role,
        assignment_id=1,
    )
    teacher = _user(
        user_id=TEACHER_USER_ID,
        username="teacher",
        role=teacher_role,
        assignment_id=2,
    )
    student = _user(
        user_id=STUDENT_USER_ID,
        username="student",
        role=student_role,
        assignment_id=3,
    )
    other_teacher = _user(
        user_id=OTHER_TEACHER_USER_ID,
        username="other_teacher",
        role=teacher_role,
        assignment_id=4,
    )

    teacher.created_questions.append(
        Question(
            id=100,
            question_type=QuestionType.SINGLE_CHOICE,
            content="Linux 中查看当前工作目录的命令？",
            correct_answer=["A"],
            analysis="pwd 显示当前工作目录。",
            difficulty=QuestionDifficulty.EASY,
            status=RecordStatus.ACTIVE,
            options=[
                QuestionOption(
                    id=1001,
                    option_key="A",
                    option_content="pwd",
                    sort_order=1,
                ),
                QuestionOption(
                    id=1002,
                    option_key="B",
                    option_content="cd",
                    sort_order=2,
                ),
            ],
        )
    )
    other_teacher.created_questions.append(
        Question(
            id=101,
            question_type=QuestionType.TRUE_FALSE,
            content="Kubernetes 是容器编排系统。",
            correct_answer=["true"],
            analysis=None,
            difficulty=QuestionDifficulty.MEDIUM,
            status=RecordStatus.DISABLED,
        )
    )
    admin.created_questions.append(
        Question(
            id=102,
            question_type=QuestionType.MULTIPLE_CHOICE,
            content="哪些是 Linux 命令？",
            correct_answer=["A", "C"],
            analysis=None,
            difficulty=QuestionDifficulty.HARD,
            status=RecordStatus.ACTIVE,
            options=[
                QuestionOption(
                    id=1003,
                    option_key="A",
                    option_content="ls",
                    sort_order=1,
                ),
                QuestionOption(
                    id=1004,
                    option_key="B",
                    option_content="Excel",
                    sort_order=2,
                ),
                QuestionOption(
                    id=1005,
                    option_key="C",
                    option_content="grep",
                    sort_order=3,
                ),
            ],
        )
    )
    session.add_all([admin, teacher, student, other_teacher])


def _request(
    method: str,
    path: str,
    *,
    json: dict[str, object] | None = None,
    user_id: int | None = ADMIN_USER_ID,
) -> Response:
    async def perform_request() -> Response:
        test_engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(test_engine)
        with Session(test_engine) as session:
            _seed_test_data(session)
            session.commit()

        async def override_db_session() -> AsyncIterator[AsyncSession]:
            with Session(test_engine, expire_on_commit=False) as session:
                yield cast(AsyncSession, AsyncSessionAdapter(session))

        app.dependency_overrides[get_db_session] = override_db_session
        headers = (
            {"Authorization": f"Bearer {create_access_token(user_id)}"}
            if user_id is not None
            else None
        )
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                return await client.request(method, path, json=json, headers=headers)
        finally:
            app.dependency_overrides.pop(get_db_session, None)
            test_engine.dispose()

    return asyncio.run(perform_request())


def _choice_payload(
    *,
    question_type: str = "single_choice",
    correct_answer: list[str] | None = None,
    options: list[dict[str, object]] | None = None,
    content: str = "Linux 中查看当前工作目录的命令是什么？",
    difficulty: str = "easy",
) -> dict[str, object]:
    return {
        "question_type": question_type,
        "content": content,
        "options": options
        if options is not None
        else [
            {"option_key": "A", "option_content": "pwd", "sort_order": 1},
            {"option_key": "B", "option_content": "cd", "sort_order": 2},
            {"option_key": "C", "option_content": "mkdir", "sort_order": 3},
        ],
        "correct_answer": correct_answer if correct_answer is not None else ["A"],
        "analysis": "测试解析",
        "difficulty": difficulty,
    }


def _true_false_payload(answer: str = "true") -> dict[str, object]:
    return {
        "question_type": "true_false",
        "content": "Kubernetes 是容器编排系统。",
        "options": [],
        "correct_answer": [answer],
        "analysis": "Kubernetes 用于容器编排。",
        "difficulty": "easy",
    }


@pytest.mark.parametrize("user_id", [ADMIN_USER_ID, TEACHER_USER_ID])
def test_admin_and_teacher_can_create_question(user_id: int) -> None:
    response = _request(
        "POST",
        "/api/v1/questions",
        json=_choice_payload(),
        user_id=user_id,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["created_by"]["id"] == user_id
    assert body["status"] == "active"
    assert body["correct_answer"] == ["A"]


def test_student_cannot_create_question() -> None:
    response = _request(
        "POST",
        "/api/v1/questions",
        json=_choice_payload(),
        user_id=STUDENT_USER_ID,
    )
    assert response.status_code == 403


def test_unauthenticated_user_cannot_access_questions() -> None:
    response = _request("GET", "/api/v1/questions", user_id=None)
    assert response.status_code == 401


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        (
            _choice_payload(
                options=[{"option_key": "A", "option_content": "pwd", "sort_order": 1}]
            ),
            "至少需要两个选项",
        ),
        (_choice_payload(correct_answer=["A", "B"]), "只能有一个正确答案"),
        (_choice_payload(correct_answer=["D"]), "选项不存在"),
        (
            _choice_payload(
                options=[
                    {"option_key": "A", "option_content": "pwd", "sort_order": 1},
                    {"option_key": "a", "option_content": "cd", "sort_order": 2},
                ]
            ),
            "选项编码不能重复",
        ),
    ],
)
def test_invalid_single_choice_is_rejected(
    payload: dict[str, object],
    message: str,
) -> None:
    response = _request("POST", "/api/v1/questions", json=payload)
    assert response.status_code == 400
    assert message in response.json()["detail"]


def test_choice_keys_and_answer_are_normalized() -> None:
    payload = _choice_payload(
        options=[
            {"option_key": " a ", "option_content": "pwd", "sort_order": 1},
            {"option_key": " b ", "option_content": "cd", "sort_order": 2},
        ],
        correct_answer=[" a "],
    )
    response = _request("POST", "/api/v1/questions", json=payload)

    assert response.status_code == 201
    assert [item["option_key"] for item in response.json()["options"]] == ["A", "B"]
    assert response.json()["correct_answer"] == ["A"]


def test_valid_multiple_choice_is_normalized_and_sorted() -> None:
    response = _request(
        "POST",
        "/api/v1/questions",
        json=_choice_payload(
            question_type="multiple_choice",
            correct_answer=["c", "A"],
        ),
    )
    assert response.status_code == 201
    assert response.json()["correct_answer"] == ["A", "C"]


@pytest.mark.parametrize(
    ("answers", "message"),
    [
        (["A"], "至少需要两个正确答案"),
        (["A", "a"], "不能包含重复值"),
        (["A", "D"], "选项不存在"),
    ],
)
def test_invalid_multiple_choice_is_rejected(
    answers: list[str],
    message: str,
) -> None:
    response = _request(
        "POST",
        "/api/v1/questions",
        json=_choice_payload(
            question_type="multiple_choice",
            correct_answer=answers,
        ),
    )
    assert response.status_code == 400
    assert message in response.json()["detail"]


@pytest.mark.parametrize("answer", ["true", "false"])
def test_valid_true_false_question(answer: str) -> None:
    response = _request(
        "POST",
        "/api/v1/questions",
        json=_true_false_payload(answer),
    )
    assert response.status_code == 201
    assert response.json()["correct_answer"] == [answer]
    assert response.json()["options"] == []


def test_true_false_options_are_rejected() -> None:
    payload = _true_false_payload()
    payload["options"] = [{"option_key": "A", "option_content": "正确", "sort_order": 1}]
    response = _request("POST", "/api/v1/questions", json=payload)
    assert response.status_code == 400
    assert "不能包含选项" in response.json()["detail"]


@pytest.mark.parametrize("answer", ["TRUE", "正确", "1", "A"])
def test_invalid_true_false_answer_is_rejected(answer: str) -> None:
    response = _request(
        "POST",
        "/api/v1/questions",
        json=_true_false_payload(answer),
    )
    assert response.status_code == 400


def test_admin_sees_all_questions_and_pagination_works() -> None:
    first_page = _request("GET", "/api/v1/questions?page=1&page_size=2")
    second_page = _request("GET", "/api/v1/questions?page=2&page_size=2")

    assert first_page.status_code == 200
    assert first_page.json()["total"] == 3
    assert len(first_page.json()["items"]) == 2
    assert [item["id"] for item in second_page.json()["items"]] == [102]


def test_teacher_only_sees_own_questions() -> None:
    response = _request(
        "GET",
        "/api/v1/questions",
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["created_by"]["id"] == TEACHER_USER_ID


@pytest.mark.parametrize(
    ("query", "expected_id"),
    [
        ("keyword=Kubernetes", 101),
        ("question_type=multiple_choice", 102),
        ("difficulty=hard", 102),
        ("status=disabled", 101),
    ],
)
def test_question_list_filters(query: str, expected_id: int) -> None:
    response = _request("GET", f"/api/v1/questions?{query}")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [expected_id]


def test_question_detail_returns_full_options() -> None:
    response = _request("GET", "/api/v1/questions/100")
    assert response.status_code == 200
    assert [item["option_key"] for item in response.json()["options"]] == ["A", "B"]
    assert response.json()["correct_answer"] == ["A"]


def test_teacher_cannot_view_or_edit_another_teachers_question() -> None:
    detail = _request(
        "GET",
        "/api/v1/questions/101",
        user_id=TEACHER_USER_ID,
    )
    update = _request(
        "PUT",
        "/api/v1/questions/101",
        json=_true_false_payload("false"),
        user_id=TEACHER_USER_ID,
    )
    assert detail.status_code == 404
    assert update.status_code == 404


def test_admin_can_edit_teachers_question_and_replace_options() -> None:
    payload = _choice_payload(
        options=[
            {"option_key": "X", "option_content": "更新选项", "sort_order": 1},
            {"option_key": "Y", "option_content": "另一个选项", "sort_order": 2},
        ],
        correct_answer=["Y"],
        content="更新后的单选题",
    )
    response = _request("PUT", "/api/v1/questions/100", json=payload)

    assert response.status_code == 200
    assert response.json()["content"] == "更新后的单选题"
    assert [item["option_key"] for item in response.json()["options"]] == ["X", "Y"]
    assert response.json()["correct_answer"] == ["Y"]


def test_single_choice_can_switch_to_true_false_and_clears_options() -> None:
    response = _request(
        "PUT",
        "/api/v1/questions/100",
        json=_true_false_payload(),
    )
    assert response.status_code == 200
    assert response.json()["question_type"] == "true_false"
    assert response.json()["options"] == []


def test_true_false_to_choice_requires_valid_options() -> None:
    response = _request(
        "PUT",
        "/api/v1/questions/101",
        json=_choice_payload(options=[]),
    )
    assert response.status_code == 400


def test_failed_update_leaves_stored_question_unchanged() -> None:
    async def exercise() -> None:
        test_engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(test_engine)
        with Session(test_engine, expire_on_commit=False) as sync_session:
            _seed_test_data(sync_session)
            sync_session.commit()
            adapter = cast(AsyncSession, AsyncSessionAdapter(sync_session))
            question = sync_session.scalar(select(Question).where(Question.id == 100))
            assert question is not None
            original_content = question.content

            from app.modules.questions.schemas import QuestionUpdate
            from app.modules.questions.service import update_question

            admin = sync_session.scalar(select(User).where(User.id == ADMIN_USER_ID))
            assert admin is not None
            with pytest.raises(Exception):  # noqa: B017
                await update_question(
                    adapter,
                    100,
                    QuestionUpdate.model_validate(
                        _choice_payload(content="不应保存", correct_answer=["Z"])
                    ),
                    admin,
                )
            sync_session.expire_all()
            stored = sync_session.scalar(select(Question).where(Question.id == 100))
            assert stored is not None
            assert stored.content == original_content
        test_engine.dispose()

    asyncio.run(exercise())


def test_question_can_be_disabled_and_remains_queryable() -> None:
    response = _request(
        "PATCH",
        "/api/v1/questions/100/status",
        json={"status": "disabled"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "disabled"


def test_teacher_cannot_change_another_teachers_question_status() -> None:
    response = _request(
        "PATCH",
        "/api/v1/questions/101/status",
        json={"status": "active"},
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 404


def test_no_question_delete_route_is_registered() -> None:
    delete_response = _request("DELETE", "/api/v1/questions/100")
    assert delete_response.status_code == 405
    assert not any(
        route.path == "/api/v1/questions/{question_id}" and "DELETE" in (route.methods or set())
        for route in app.routes
    )
