import asyncio
from collections.abc import AsyncIterator, Callable
from decimal import Decimal
from typing import cast

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import Select, create_engine, func, select
from sqlalchemy.engine import Result, ScalarResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.enums import RecordStatus
from app.db.models import (
    Base,
    Paper,
    PaperQuestion,
    Question,
    QuestionOption,
    Role,
    User,
    UserRole,
)
from app.db.session import get_db_session
from app.main import app
from app.modules.auth.security import create_access_token
from app.modules.papers.enums import PaperStatus
from app.modules.questions.enums import QuestionDifficulty, QuestionType

ADMIN_USER_ID = 1
TEACHER_USER_ID = 2
STUDENT_USER_ID = 3
OTHER_TEACHER_USER_ID = 4

TEACHER_DRAFT_PAPER_ID = 10
OTHER_TEACHER_PAPER_ID = 11
ADMIN_ACTIVE_PAPER_ID = 12
TEACHER_ACTIVE_PAPER_ID = 13
TEACHER_DISABLED_PAPER_ID = 14
TEACHER_EMPTY_PAPER_ID = 15


class AsyncSessionAdapter:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._next_paper_id = 1000
        self._next_paper_question_id = 2000

    def add(self, instance: object) -> None:
        if isinstance(instance, Paper) and instance.id is None:
            instance.id = self._next_paper_id
            self._next_paper_id += 1
        if isinstance(instance, PaperQuestion) and instance.id is None:
            instance.id = self._next_paper_question_id
            self._next_paper_question_id += 1
        self._session.add(instance)

    async def delete(self, instance: object) -> None:
        self._session.delete(instance)

    async def scalar(self, statement: Select[tuple[object]]) -> object | None:
        return self._session.scalar(statement)

    async def scalars(self, statement: Select[tuple[object]]) -> ScalarResult[object]:
        return self._session.scalars(statement)

    async def execute(self, statement: Select[tuple[object, ...]]) -> Result[object]:
        return self._session.execute(statement)

    async def flush(self) -> None:
        self._session.flush()

    async def commit(self) -> None:
        self._session.commit()

    async def rollback(self) -> None:
        self._session.rollback()


def _user(*, user_id: int, username: str, role: Role, assignment_id: int) -> User:
    user = User(
        id=user_id,
        username=username,
        password_hash="test-password-hash",
        real_name=username,
        status=RecordStatus.ACTIVE,
    )
    user.role_assignments.append(UserRole(id=assignment_id, role=role))
    return user


def _question(
    *,
    question_id: int,
    content: str,
    status: RecordStatus = RecordStatus.ACTIVE,
    question_type: QuestionType = QuestionType.SINGLE_CHOICE,
) -> Question:
    options = (
        []
        if question_type == QuestionType.TRUE_FALSE
        else [
            QuestionOption(
                id=question_id * 10 + 1,
                option_key="A",
                option_content="正确选项",
                sort_order=1,
            ),
            QuestionOption(
                id=question_id * 10 + 2,
                option_key="B",
                option_content="错误选项",
                sort_order=2,
            ),
        ]
    )
    return Question(
        id=question_id,
        question_type=question_type,
        content=content,
        correct_answer=["true"] if question_type == QuestionType.TRUE_FALSE else ["A"],
        analysis="测试解析",
        difficulty=QuestionDifficulty.EASY,
        status=status,
        options=options,
    )


def _paper(
    *,
    paper_id: int,
    name: str,
    status: PaperStatus,
    items: list[tuple[int, Question, str]],
) -> Paper:
    return Paper(
        id=paper_id,
        name=name,
        description=f"{name}描述",
        total_score=sum((Decimal(score) for _, _, score in items), Decimal("0.00")),
        status=status,
        paper_questions=[
            PaperQuestion(
                id=item_id,
                question=question,
                score=Decimal(score),
                sort_order=sort_order,
            )
            for sort_order, (item_id, question, score) in enumerate(items, start=1)
        ],
    )


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

    teacher_question_1 = _question(
        question_id=100,
        content="Linux 中查看当前目录的命令？",
    )
    teacher_question_2 = _question(
        question_id=101,
        content="哪些属于 Linux 文件系统？",
        question_type=QuestionType.MULTIPLE_CHOICE,
    )
    teacher_disabled_question = _question(
        question_id=102,
        content="已禁用题目",
        status=RecordStatus.DISABLED,
    )
    other_question = _question(question_id=200, content="其他教师题目")
    admin_question = _question(
        question_id=300,
        content="Kubernetes 是容器编排系统。",
        question_type=QuestionType.TRUE_FALSE,
    )

    teacher.created_questions.extend(
        [teacher_question_1, teacher_question_2, teacher_disabled_question]
    )
    other_teacher.created_questions.append(other_question)
    admin.created_questions.append(admin_question)

    teacher.created_papers.extend(
        [
            _paper(
                paper_id=TEACHER_DRAFT_PAPER_ID,
                name="Linux 草稿试卷",
                status=PaperStatus.DRAFT,
                items=[
                    (1000, teacher_question_1, "2.00"),
                    (1001, teacher_question_2, "3.00"),
                ],
            ),
            _paper(
                paper_id=TEACHER_ACTIVE_PAPER_ID,
                name="Linux 已启用试卷",
                status=PaperStatus.ACTIVE,
                items=[(1300, teacher_question_1, "2.00")],
            ),
            _paper(
                paper_id=TEACHER_DISABLED_PAPER_ID,
                name="Linux 已禁用试卷",
                status=PaperStatus.DISABLED,
                items=[(1400, teacher_question_2, "3.00")],
            ),
            _paper(
                paper_id=TEACHER_EMPTY_PAPER_ID,
                name="Linux 空白试卷",
                status=PaperStatus.DRAFT,
                items=[],
            ),
        ]
    )
    other_teacher.created_papers.append(
        _paper(
            paper_id=OTHER_TEACHER_PAPER_ID,
            name="其他教师试卷",
            status=PaperStatus.DRAFT,
            items=[(1100, other_question, "4.00")],
        )
    )
    admin.created_papers.append(
        _paper(
            paper_id=ADMIN_ACTIVE_PAPER_ID,
            name="管理员试卷",
            status=PaperStatus.ACTIVE,
            items=[(1200, admin_question, "5.00")],
        )
    )
    session.add_all([admin, teacher, student, other_teacher])


def _request(
    method: str,
    path: str,
    *,
    json: dict[str, object] | None = None,
    user_id: int | None = ADMIN_USER_ID,
    inspect: Callable[[Session], None] | None = None,
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
                response = await client.request(method, path, json=json, headers=headers)
            if inspect is not None:
                with Session(test_engine) as session:
                    inspect(session)
            return response
        finally:
            app.dependency_overrides.pop(get_db_session, None)
            test_engine.dispose()

    return asyncio.run(perform_request())


def _paper_payload(name: str = "新建 Linux 试卷") -> dict[str, object]:
    return {"name": name, "description": "人工组卷测试"}


def _batch_payload(*items: tuple[int, str]) -> dict[str, object]:
    return {
        "items": [
            {"question_id": question_id, "score": score}
            for question_id, score in items
        ]
    }


@pytest.mark.parametrize("user_id", [ADMIN_USER_ID, TEACHER_USER_ID])
def test_admin_and_teacher_can_create_draft_paper(user_id: int) -> None:
    response = _request("POST", "/api/v1/papers", json=_paper_payload(), user_id=user_id)

    assert response.status_code == 201
    assert response.json()["status"] == "draft"
    assert Decimal(response.json()["total_score"]) == Decimal("0.00")
    assert response.json()["question_count"] == 0
    assert response.json()["creator"]["id"] == user_id


def test_student_cannot_create_or_list_papers() -> None:
    create_response = _request(
        "POST",
        "/api/v1/papers",
        json=_paper_payload(),
        user_id=STUDENT_USER_ID,
    )
    list_response = _request("GET", "/api/v1/papers", user_id=STUDENT_USER_ID)

    assert create_response.status_code == 403
    assert list_response.status_code == 403


def test_unauthenticated_user_cannot_access_papers() -> None:
    response = _request("GET", "/api/v1/papers", user_id=None)
    assert response.status_code == 401


def test_create_rejects_system_managed_fields() -> None:
    payload = _paper_payload()
    payload["total_score"] = 999
    response = _request("POST", "/api/v1/papers", json=payload)
    assert response.status_code == 422


def test_admin_list_is_paginated_and_has_efficient_question_count() -> None:
    response = _request("GET", "/api/v1/papers?page=2&page_size=2")

    assert response.status_code == 200
    assert response.json()["total"] == 6
    assert response.json()["page"] == 2
    assert response.json()["page_size"] == 2
    assert len(response.json()["items"]) == 2
    assert all("question_count" in item for item in response.json()["items"])


def test_teacher_list_only_contains_owned_papers() -> None:
    response = _request("GET", "/api/v1/papers", user_id=TEACHER_USER_ID)

    assert response.status_code == 200
    assert response.json()["total"] == 4
    assert {item["creator"]["id"] for item in response.json()["items"]} == {
        TEACHER_USER_ID
    }


@pytest.mark.parametrize(
    ("query", "expected_id"),
    [
        ("keyword=其他教师", OTHER_TEACHER_PAPER_ID),
        ("status=disabled", TEACHER_DISABLED_PAPER_ID),
    ],
)
def test_paper_list_filters(query: str, expected_id: int) -> None:
    response = _request("GET", f"/api/v1/papers?{query}")
    assert response.status_code == 200
    assert expected_id in {item["id"] for item in response.json()["items"]}


def test_detail_returns_ordered_questions_options_answers_and_scores() -> None:
    response = _request("GET", f"/api/v1/papers/{TEACHER_DRAFT_PAPER_ID}")

    assert response.status_code == 200
    body = response.json()
    assert body["question_count"] == 2
    assert [item["question_id"] for item in body["questions"]] == [100, 101]
    assert body["questions"][0]["options"][0]["option_key"] == "A"
    assert body["questions"][0]["correct_answer"] == ["A"]
    assert Decimal(body["total_score"]) == Decimal("5.00")


def test_teacher_cannot_view_or_update_another_teachers_paper() -> None:
    detail = _request(
        "GET",
        f"/api/v1/papers/{OTHER_TEACHER_PAPER_ID}",
        user_id=TEACHER_USER_ID,
    )
    update = _request(
        "PUT",
        f"/api/v1/papers/{OTHER_TEACHER_PAPER_ID}",
        json=_paper_payload("越权修改"),
        user_id=TEACHER_USER_ID,
    )

    assert detail.status_code == 404
    assert update.status_code == 404


def test_admin_can_update_teacher_draft_paper() -> None:
    response = _request(
        "PUT",
        f"/api/v1/papers/{TEACHER_DRAFT_PAPER_ID}",
        json={"name": "管理员更新名称", "description": "更新描述"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "管理员更新名称"
    assert response.json()["creator"]["id"] == TEACHER_USER_ID


@pytest.mark.parametrize("paper_id", [TEACHER_ACTIVE_PAPER_ID, TEACHER_DISABLED_PAPER_ID])
def test_non_draft_paper_basic_information_is_locked(paper_id: int) -> None:
    response = _request("PUT", f"/api/v1/papers/{paper_id}", json=_paper_payload())
    assert response.status_code == 409
    assert "只有草稿" in response.json()["detail"]


def test_add_single_question_appends_and_recalculates_decimal_total() -> None:
    response = _request(
        "POST",
        f"/api/v1/papers/{TEACHER_EMPTY_PAPER_ID}/questions",
        json=_batch_payload((100, "2.50")),
        user_id=TEACHER_USER_ID,
    )

    assert response.status_code == 200
    assert Decimal(response.json()["total_score"]) == Decimal("2.50")
    assert response.json()["questions"][0]["sort_order"] == 1


def test_batch_add_appends_in_request_order_and_recalculates_total() -> None:
    response = _request(
        "POST",
        f"/api/v1/papers/{TEACHER_EMPTY_PAPER_ID}/questions",
        json=_batch_payload((101, "5.00"), (100, "2.00")),
        user_id=TEACHER_USER_ID,
    )

    assert response.status_code == 200
    assert [item["question_id"] for item in response.json()["questions"]] == [101, 100]
    assert [item["sort_order"] for item in response.json()["questions"]] == [1, 2]
    assert Decimal(response.json()["total_score"]) == Decimal("7.00")


@pytest.mark.parametrize(
    "payload",
    [
        _batch_payload((100, "1.00"), (100, "2.00")),
        _batch_payload((100, "1.00")),
    ],
)
def test_duplicate_question_in_request_or_paper_is_rejected(
    payload: dict[str, object],
) -> None:
    paper_id = (
        TEACHER_EMPTY_PAPER_ID
        if len(cast(list[object], payload["items"])) == 2
        else TEACHER_DRAFT_PAPER_ID
    )
    response = _request(
        "POST",
        f"/api/v1/papers/{paper_id}/questions",
        json=payload,
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 409


def test_disabled_or_missing_question_cannot_be_added() -> None:
    disabled = _request(
        "POST",
        f"/api/v1/papers/{TEACHER_EMPTY_PAPER_ID}/questions",
        json=_batch_payload((102, "2.00")),
        user_id=TEACHER_USER_ID,
    )
    missing = _request(
        "POST",
        f"/api/v1/papers/{TEACHER_EMPTY_PAPER_ID}/questions",
        json=_batch_payload((999, "2.00")),
        user_id=TEACHER_USER_ID,
    )

    assert disabled.status_code == 409
    assert missing.status_code == 404


def test_teacher_cannot_add_another_teachers_question_but_admin_can() -> None:
    teacher_response = _request(
        "POST",
        f"/api/v1/papers/{TEACHER_EMPTY_PAPER_ID}/questions",
        json=_batch_payload((200, "4.00")),
        user_id=TEACHER_USER_ID,
    )
    admin_response = _request(
        "POST",
        f"/api/v1/papers/{TEACHER_EMPTY_PAPER_ID}/questions",
        json=_batch_payload((200, "4.00")),
        user_id=ADMIN_USER_ID,
    )

    assert teacher_response.status_code == 404
    assert admin_response.status_code == 200


def test_batch_validation_failure_adds_nothing() -> None:
    def inspect_database(session: Session) -> None:
        count = session.scalar(
            select(func.count(PaperQuestion.id)).where(
                PaperQuestion.paper_id == TEACHER_EMPTY_PAPER_ID
            )
        )
        paper = session.get(Paper, TEACHER_EMPTY_PAPER_ID)
        assert count == 0
        assert paper is not None
        assert paper.total_score == Decimal("0.00")

    response = _request(
        "POST",
        f"/api/v1/papers/{TEACHER_EMPTY_PAPER_ID}/questions",
        json=_batch_payload((100, "2.00"), (999, "3.00")),
        user_id=TEACHER_USER_ID,
        inspect=inspect_database,
    )

    assert response.status_code == 404


def test_update_score_recalculates_total() -> None:
    response = _request(
        "PATCH",
        f"/api/v1/papers/{TEACHER_DRAFT_PAPER_ID}/questions/100",
        json={"score": "2.50"},
        user_id=TEACHER_USER_ID,
    )

    assert response.status_code == 200
    assert Decimal(response.json()["total_score"]) == Decimal("5.50")
    assert Decimal(response.json()["questions"][0]["score"]) == Decimal("2.50")


@pytest.mark.parametrize("score", ["0", "-1"])
def test_non_positive_score_is_rejected(score: str) -> None:
    response = _request(
        "PATCH",
        f"/api/v1/papers/{TEACHER_DRAFT_PAPER_ID}/questions/100",
        json={"score": score},
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 422


def test_remove_question_recalculates_total_and_closes_order_gap() -> None:
    response = _request(
        "DELETE",
        f"/api/v1/papers/{TEACHER_DRAFT_PAPER_ID}/questions/100",
        user_id=TEACHER_USER_ID,
    )

    assert response.status_code == 200
    assert Decimal(response.json()["total_score"]) == Decimal("3.00")
    assert [item["sort_order"] for item in response.json()["questions"]] == [1]
    assert response.json()["questions"][0]["question_id"] == 101


def test_missing_paper_question_returns_404_for_score_and_remove() -> None:
    score = _request(
        "PATCH",
        f"/api/v1/papers/{TEACHER_DRAFT_PAPER_ID}/questions/999",
        json={"score": "2.00"},
    )
    remove = _request(
        "DELETE",
        f"/api/v1/papers/{TEACHER_DRAFT_PAPER_ID}/questions/999",
    )

    assert score.status_code == 404
    assert remove.status_code == 404


def test_reorder_uses_paper_question_ids_and_writes_continuous_order() -> None:
    response = _request(
        "PUT",
        f"/api/v1/papers/{TEACHER_DRAFT_PAPER_ID}/questions/order",
        json={"paper_question_ids": [1001, 1000]},
        user_id=TEACHER_USER_ID,
    )

    assert response.status_code == 200
    assert [item["paper_question_id"] for item in response.json()["questions"]] == [
        1001,
        1000,
    ]
    assert [item["sort_order"] for item in response.json()["questions"]] == [1, 2]


@pytest.mark.parametrize(
    "ids",
    [
        [1000, 1000],
        [1000],
        [1000, 1100],
    ],
)
def test_invalid_reorder_is_rejected_and_original_order_remains(
    ids: list[int],
) -> None:
    def inspect_database(session: Session) -> None:
        stored = list(
            session.scalars(
                select(PaperQuestion)
                .where(PaperQuestion.paper_id == TEACHER_DRAFT_PAPER_ID)
                .order_by(PaperQuestion.sort_order)
            )
        )
        assert [item.id for item in stored] == [1000, 1001]
        assert [item.sort_order for item in stored] == [1, 2]

    response = _request(
        "PUT",
        f"/api/v1/papers/{TEACHER_DRAFT_PAPER_ID}/questions/order",
        json={"paper_question_ids": ids},
        user_id=TEACHER_USER_ID,
        inspect=inspect_database,
    )
    assert response.status_code == 400


def test_empty_paper_cannot_be_activated() -> None:
    response = _request(
        "PATCH",
        f"/api/v1/papers/{TEACHER_EMPTY_PAPER_ID}/status",
        json={"status": "active"},
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 409


def test_non_empty_paper_can_be_activated() -> None:
    response = _request(
        "PATCH",
        f"/api/v1/papers/{TEACHER_DRAFT_PAPER_ID}/status",
        json={"status": "active"},
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "active"


@pytest.mark.parametrize("paper_id", [TEACHER_ACTIVE_PAPER_ID, TEACHER_DISABLED_PAPER_ID])
@pytest.mark.parametrize(
    ("method", "suffix", "payload"),
    [
        ("POST", "/questions", _batch_payload((101, "2.00"))),
        ("PATCH", "/questions/100", {"score": "2.50"}),
        ("DELETE", "/questions/100", None),
        ("PUT", "/questions/order", {"paper_question_ids": [1300]}),
    ],
)
def test_non_draft_paper_question_operations_are_locked(
    paper_id: int,
    method: str,
    suffix: str,
    payload: dict[str, object] | None,
) -> None:
    response = _request(
        method,
        f"/api/v1/papers/{paper_id}{suffix}",
        json=payload,
    )
    assert response.status_code == 409


def test_active_paper_can_return_to_draft_then_be_modified() -> None:
    draft_response = _request(
        "PATCH",
        f"/api/v1/papers/{TEACHER_ACTIVE_PAPER_ID}/status",
        json={"status": "draft"},
        user_id=TEACHER_USER_ID,
    )
    assert draft_response.status_code == 200
    assert draft_response.json()["status"] == "draft"


def test_teacher_cannot_change_another_teachers_paper_status() -> None:
    response = _request(
        "PATCH",
        f"/api/v1/papers/{OTHER_TEACHER_PAPER_ID}/status",
        json={"status": "active"},
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 404


def test_no_paper_delete_route_is_registered() -> None:
    response = _request("DELETE", f"/api/v1/papers/{TEACHER_DRAFT_PAPER_ID}")
    assert response.status_code == 405
    assert not any(
        route.path == "/api/v1/papers/{paper_id}" and "DELETE" in (route.methods or set())
        for route in app.routes
    )
