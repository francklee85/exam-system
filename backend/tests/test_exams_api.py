import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import datetime
from decimal import Decimal
from typing import cast

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import Select, create_engine, func, select
from sqlalchemy.engine import Result, ScalarResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.exceptions import ResourceConflictError
from app.db.enums import RecordStatus
from app.db.models import (
    Base,
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
from app.db.session import get_db_session
from app.main import app
from app.modules.auth.security import create_access_token
from app.modules.exams import service
from app.modules.exams.enums import (
    ExamRuntimeStatus,
    ExamStatus,
    ExamTargetType,
    calculate_runtime_status,
)
from app.modules.papers.enums import PaperStatus
from app.modules.questions.enums import QuestionDifficulty, QuestionType

ADMIN_USER_ID = 1
TEACHER_USER_ID = 2
STUDENT_USER_ID = 3
OTHER_TEACHER_USER_ID = 4

ACTIVE_MAJOR_ID = 10
DISABLED_MAJOR_ID = 11
ACTIVE_CLASS_ID = 20
DISABLED_CLASS_ID = 21
CLASS_WITH_DISABLED_MAJOR_ID = 22

TEACHER_ACTIVE_PAPER_ID = 30
TEACHER_DRAFT_PAPER_ID = 31
TEACHER_DISABLED_PAPER_ID = 32
OTHER_TEACHER_ACTIVE_PAPER_ID = 33
ADMIN_ACTIVE_PAPER_ID = 34
CORRUPT_ACTIVE_PAPER_ID = 35
EMPTY_ACTIVE_PAPER_ID = 36

TEACHER_DRAFT_EXAM_ID = 40
OTHER_TEACHER_DRAFT_EXAM_ID = 41
TEACHER_PUBLISHED_EXAM_ID = 42
TEACHER_NO_TARGET_EXAM_ID = 43
CORRUPT_PAPER_EXAM_ID = 44


class AsyncSessionAdapter:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._next_exam_id = 1000
        self._next_target_id = 2000
        self._next_snapshot_id = 3000

    def _assign_id(self, instance: object) -> None:
        if isinstance(instance, Exam) and instance.id is None:
            instance.id = self._next_exam_id
            self._next_exam_id += 1
        elif isinstance(instance, ExamTarget) and instance.id is None:
            instance.id = self._next_target_id
            self._next_target_id += 1
        elif isinstance(instance, ExamQuestion) and instance.id is None:
            instance.id = self._next_snapshot_id
            self._next_snapshot_id += 1

    def _assign_pending_ids(self) -> None:
        for instance in list(self._session.new):
            self._assign_id(instance)

    def add(self, instance: object) -> None:
        self._assign_id(instance)
        self._session.add(instance)

    async def delete(self, instance: object) -> None:
        self._session.delete(instance)

    async def scalar(self, statement: Select[tuple[object]]) -> object | None:
        return self._session.scalar(statement)

    async def scalars(self, statement: Select[tuple[object]]) -> ScalarResult[object]:
        return self._session.scalars(statement)

    async def execute(self, statement: object) -> Result[object]:
        return self._session.execute(statement)

    async def flush(self) -> None:
        self._assign_pending_ids()
        self._session.flush()

    async def commit(self) -> None:
        self._assign_pending_ids()
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
    question_id: int,
    question_type: QuestionType,
    content: str,
    *,
    status: RecordStatus = RecordStatus.ACTIVE,
) -> Question:
    options: list[QuestionOption]
    correct_answer: list[str]
    if question_type == QuestionType.TRUE_FALSE:
        options = []
        correct_answer = ["true"]
    else:
        options = [
            QuestionOption(
                id=question_id * 10 + 1,
                option_key="A",
                option_content=f"{content} A",
                sort_order=1,
            ),
            QuestionOption(
                id=question_id * 10 + 2,
                option_key="B",
                option_content=f"{content} B",
                sort_order=2,
            ),
            QuestionOption(
                id=question_id * 10 + 3,
                option_key="C",
                option_content=f"{content} C",
                sort_order=3,
            ),
        ]
        correct_answer = (
            ["A", "B"]
            if question_type == QuestionType.MULTIPLE_CHOICE
            else ["A"]
        )
    return Question(
        id=question_id,
        question_type=question_type,
        content=content,
        correct_answer=correct_answer,
        analysis=f"{content}解析",
        difficulty=QuestionDifficulty.EASY,
        status=status,
        options=options,
    )


def _paper(
    paper_id: int,
    name: str,
    status: PaperStatus,
    questions: list[tuple[int, Question, str]],
    *,
    total_score: str | None = None,
) -> Paper:
    calculated = sum(
        (Decimal(score) for _, _, score in questions),
        Decimal("0.00"),
    )
    return Paper(
        id=paper_id,
        name=name,
        total_score=Decimal(total_score) if total_score is not None else calculated,
        status=status,
        paper_questions=[
            PaperQuestion(
                id=item_id,
                question=question,
                score=Decimal(score),
                sort_order=sort_order,
            )
            for sort_order, (item_id, question, score) in enumerate(questions, start=1)
        ],
    )


def _exam(
    exam_id: int,
    name: str,
    paper: Paper,
    status: ExamStatus,
    *,
    target: ExamTarget | None,
    snapshots: list[ExamQuestion] | None = None,
) -> Exam:
    return Exam(
        id=exam_id,
        name=name,
        paper=paper,
        description=f"{name}说明",
        start_time=datetime(2026, 7, 30, 1, 0),
        end_time=datetime(2026, 7, 30, 3, 0),
        duration_minutes=90,
        pass_score=Decimal("6.00"),
        total_score=paper.total_score,
        status=status,
        published_at=(
            datetime(2026, 7, 23, 1, 0)
            if status == ExamStatus.PUBLISHED
            else None
        ),
        targets=[target] if target is not None else [],
        snapshot_questions=snapshots or [],
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

    active_major = Major(
        id=ACTIVE_MAJOR_ID,
        name="云计算",
        code="CLOUD",
        status=RecordStatus.ACTIVE,
    )
    disabled_major = Major(
        id=DISABLED_MAJOR_ID,
        name="已禁用专业",
        code="DISABLED",
        status=RecordStatus.DISABLED,
    )
    active_class = Class(
        id=ACTIVE_CLASS_ID,
        major=active_major,
        name="云计算2501班",
        code="CLOUD-2501",
        status=RecordStatus.ACTIVE,
    )
    disabled_class = Class(
        id=DISABLED_CLASS_ID,
        major=active_major,
        name="已禁用班级",
        code="CLOUD-DISABLED",
        status=RecordStatus.DISABLED,
    )
    class_with_disabled_major = Class(
        id=CLASS_WITH_DISABLED_MAJOR_ID,
        major=disabled_major,
        name="禁用专业下班级",
        code="DISABLED-CLASS",
        status=RecordStatus.ACTIVE,
    )

    single = _question(
        100,
        QuestionType.SINGLE_CHOICE,
        "Linux 中查看当前目录的命令？",
    )
    multiple = _question(
        101,
        QuestionType.MULTIPLE_CHOICE,
        "哪些属于 Linux 文件系统？",
    )
    # Disabled after an active paper was composed: publishing that paper remains valid.
    true_false = _question(
        102,
        QuestionType.TRUE_FALSE,
        "Kubernetes 是容器编排系统。",
        status=RecordStatus.DISABLED,
    )
    other_question = _question(200, QuestionType.SINGLE_CHOICE, "其他教师题目")
    admin_question = _question(300, QuestionType.TRUE_FALSE, "管理员题目")
    teacher.created_questions.extend([single, multiple, true_false])
    other_teacher.created_questions.append(other_question)
    admin.created_questions.append(admin_question)

    teacher_active = _paper(
        TEACHER_ACTIVE_PAPER_ID,
        "Linux 综合测试",
        PaperStatus.ACTIVE,
        [
            (1000, single, "2.50"),
            (1001, multiple, "5.00"),
            (1002, true_false, "2.50"),
        ],
    )
    teacher_draft = _paper(
        TEACHER_DRAFT_PAPER_ID,
        "草稿试卷",
        PaperStatus.DRAFT,
        [(1100, single, "2.50")],
    )
    teacher_disabled = _paper(
        TEACHER_DISABLED_PAPER_ID,
        "禁用试卷",
        PaperStatus.DISABLED,
        [(1200, single, "2.50")],
    )
    other_active = _paper(
        OTHER_TEACHER_ACTIVE_PAPER_ID,
        "其他教师试卷",
        PaperStatus.ACTIVE,
        [(1300, other_question, "4.00")],
    )
    admin_active = _paper(
        ADMIN_ACTIVE_PAPER_ID,
        "管理员试卷",
        PaperStatus.ACTIVE,
        [(1400, admin_question, "5.00")],
    )
    corrupt_active = _paper(
        CORRUPT_ACTIVE_PAPER_ID,
        "总分异常试卷",
        PaperStatus.ACTIVE,
        [(1500, single, "2.50")],
        total_score="99.00",
    )
    empty_active = _paper(
        EMPTY_ACTIVE_PAPER_ID,
        "异常空白启用试卷",
        PaperStatus.ACTIVE,
        [],
    )
    teacher.created_papers.extend(
        [
            teacher_active,
            teacher_draft,
            teacher_disabled,
            corrupt_active,
            empty_active,
        ]
    )
    other_teacher.created_papers.append(other_active)
    admin.created_papers.append(admin_active)

    teacher.created_exams.extend(
        [
            _exam(
                TEACHER_DRAFT_EXAM_ID,
                "Linux 阶段考试",
                teacher_active,
                ExamStatus.DRAFT,
                target=ExamTarget(
                    id=400,
                    target_type=ExamTargetType.CLASS,
                    target_id=ACTIVE_CLASS_ID,
                ),
            ),
            _exam(
                TEACHER_PUBLISHED_EXAM_ID,
                "已发布考试",
                teacher_active,
                ExamStatus.PUBLISHED,
                target=ExamTarget(
                    id=401,
                    target_type=ExamTargetType.ALL,
                    target_id=None,
                ),
                snapshots=[
                    ExamQuestion(
                        id=500,
                        original_question_id=single.id,
                        question_type=single.question_type,
                        content=single.content,
                        options=[
                            {
                                "key": option.option_key,
                                "content": option.option_content,
                                "sort_order": option.sort_order,
                            }
                            for option in single.options
                        ],
                        correct_answer=list(single.correct_answer),
                        analysis=single.analysis,
                        score=Decimal("2.50"),
                        sort_order=1,
                    )
                ],
            ),
            _exam(
                TEACHER_NO_TARGET_EXAM_ID,
                "未配置对象考试",
                teacher_active,
                ExamStatus.DRAFT,
                target=None,
            ),
            _exam(
                CORRUPT_PAPER_EXAM_ID,
                "异常试卷考试",
                corrupt_active,
                ExamStatus.DRAFT,
                target=ExamTarget(
                    id=402,
                    target_type=ExamTargetType.ALL,
                    target_id=None,
                ),
            ),
        ]
    )
    other_teacher.created_exams.append(
        _exam(
            OTHER_TEACHER_DRAFT_EXAM_ID,
            "其他教师考试",
            other_active,
            ExamStatus.DRAFT,
            target=ExamTarget(
                id=403,
                target_type=ExamTargetType.ALL,
                target_id=None,
            ),
        )
    )
    session.add_all(
        [
            admin,
            teacher,
            student,
            other_teacher,
            active_class,
            disabled_class,
            class_with_disabled_major,
        ]
    )


def _headers(user_id: int | None) -> dict[str, str] | None:
    if user_id is None:
        return None
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


def _run_scenario(
    callback: Callable[[AsyncClient], Awaitable[None]],
    *,
    inspect: Callable[[Session], None] | None = None,
) -> None:
    async def perform() -> None:
        engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            _seed_test_data(session)
            session.commit()

        async def override_db_session() -> AsyncIterator[AsyncSession]:
            with Session(engine, expire_on_commit=False) as session:
                yield cast(AsyncSession, AsyncSessionAdapter(session))

        app.dependency_overrides[get_db_session] = override_db_session
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                await callback(client)
            if inspect is not None:
                with Session(engine) as session:
                    inspect(session)
        finally:
            app.dependency_overrides.pop(get_db_session, None)
            engine.dispose()

    asyncio.run(perform())


def _request(
    method: str,
    path: str,
    *,
    json: dict[str, object] | None = None,
    user_id: int | None = ADMIN_USER_ID,
    inspect: Callable[[Session], None] | None = None,
) -> Response:
    captured: list[Response] = []

    async def scenario(client: AsyncClient) -> None:
        captured.append(
            await client.request(
                method,
                path,
                json=json,
                headers=_headers(user_id),
            )
        )

    _run_scenario(scenario, inspect=inspect)
    return captured[0]


def _payload(
    *,
    paper_id: int = TEACHER_ACTIVE_PAPER_ID,
    target_type: str | None = "class",
    target_id: int | None = ACTIVE_CLASS_ID,
    pass_score: str = "6.00",
) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "2026 云计算 Linux 期末考试",
        "paper_id": paper_id,
        "description": "Linux 阶段考试",
        "start_time": "2026-07-30T09:00:00+08:00",
        "end_time": "2026-07-30T11:00:00+08:00",
        "duration_minutes": 90,
        "pass_score": pass_score,
    }
    if target_type is not None:
        payload["target"] = {
            "target_type": target_type,
            "target_id": target_id,
        }
    return payload


@pytest.mark.parametrize("user_id", [ADMIN_USER_ID, TEACHER_USER_ID])
def test_admin_and_teacher_can_create_draft_exam(user_id: int) -> None:
    paper_id = (
        ADMIN_ACTIVE_PAPER_ID if user_id == ADMIN_USER_ID else TEACHER_ACTIVE_PAPER_ID
    )
    response = _request(
        "POST",
        "/api/v1/exams",
        json=_payload(
            paper_id=paper_id,
            pass_score="3.00" if user_id == ADMIN_USER_ID else "6.00",
        ),
        user_id=user_id,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["published_at"] is None
    assert Decimal(body["total_score"]) > 0
    assert body["creator"]["id"] == user_id


def test_student_and_unauthenticated_users_cannot_access_exam_management() -> None:
    student = _request("GET", "/api/v1/exams", user_id=STUDENT_USER_ID)
    unauthenticated = _request("GET", "/api/v1/exams", user_id=None)
    assert student.status_code == 403
    assert unauthenticated.status_code == 401


@pytest.mark.parametrize("field", ["status", "published_at", "total_score", "created_by"])
def test_create_rejects_system_managed_fields(field: str) -> None:
    payload = _payload()
    payload[field] = "published" if field == "status" else 999
    response = _request("POST", "/api/v1/exams", json=payload)
    assert response.status_code == 422


def test_teacher_cannot_use_another_teachers_paper_but_admin_can() -> None:
    teacher = _request(
        "POST",
        "/api/v1/exams",
        json=_payload(paper_id=OTHER_TEACHER_ACTIVE_PAPER_ID),
        user_id=TEACHER_USER_ID,
    )
    admin = _request(
        "POST",
        "/api/v1/exams",
        json=_payload(
            paper_id=OTHER_TEACHER_ACTIVE_PAPER_ID,
            pass_score="3.00",
        ),
        user_id=ADMIN_USER_ID,
    )
    assert teacher.status_code == 404
    assert admin.status_code == 201


@pytest.mark.parametrize(
    "paper_id",
    [TEACHER_DRAFT_PAPER_ID, TEACHER_DISABLED_PAPER_ID],
)
def test_only_active_paper_can_be_used(paper_id: int) -> None:
    response = _request(
        "POST",
        "/api/v1/exams",
        json=_payload(paper_id=paper_id),
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 409


def test_empty_active_paper_is_rejected() -> None:
    response = _request(
        "POST",
        "/api/v1/exams",
        json=_payload(paper_id=EMPTY_ACTIVE_PAPER_ID),
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 409


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("start_time", "2026-07-30T11:00:00"),
        ("duration_minutes", 0),
        ("duration_minutes", -1),
    ],
)
def test_invalid_time_or_duration_is_rejected(field: str, value: object) -> None:
    payload = _payload()
    payload[field] = value
    response = _request("POST", "/api/v1/exams", json=payload)
    assert response.status_code == 422


def test_pass_score_above_paper_total_is_rejected() -> None:
    response = _request(
        "POST",
        "/api/v1/exams",
        json=_payload(pass_score="10.01"),
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 409


@pytest.mark.parametrize(
    ("target_type", "target_id", "expected_name"),
    [
        ("all", None, "全部学生"),
        ("major", ACTIVE_MAJOR_ID, "云计算"),
        ("class", ACTIVE_CLASS_ID, "云计算2501班"),
    ],
)
def test_all_major_and_class_targets_are_supported(
    target_type: str,
    target_id: int | None,
    expected_name: str,
) -> None:
    response = _request(
        "POST",
        "/api/v1/exams",
        json=_payload(target_type=target_type, target_id=target_id),
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 201
    assert response.json()["target"] == {
        "type": target_type,
        "id": target_id,
        "name": expected_name,
    }


@pytest.mark.parametrize(
    ("target_type", "target_id", "expected_status"),
    [
        ("major", 999, 404),
        ("class", 999, 404),
        ("major", DISABLED_MAJOR_ID, 409),
        ("class", DISABLED_CLASS_ID, 409),
        ("class", CLASS_WITH_DISABLED_MAJOR_ID, 409),
    ],
)
def test_invalid_or_disabled_target_is_rejected(
    target_type: str,
    target_id: int,
    expected_status: int,
) -> None:
    response = _request(
        "POST",
        "/api/v1/exams",
        json=_payload(target_type=target_type, target_id=target_id),
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == expected_status


@pytest.mark.parametrize(
    ("target_type", "target_id"),
    [("all", ACTIVE_MAJOR_ID), ("major", None), ("class", None)],
)
def test_target_id_shape_is_strictly_validated(
    target_type: str,
    target_id: int | None,
) -> None:
    response = _request(
        "POST",
        "/api/v1/exams",
        json=_payload(target_type=target_type, target_id=target_id),
    )
    assert response.status_code == 422


def test_draft_can_be_created_without_target_for_incremental_configuration() -> None:
    response = _request(
        "POST",
        "/api/v1/exams",
        json=_payload(target_type=None),
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 201
    assert response.json()["target"] is None


def test_v1_request_cannot_configure_multiple_targets() -> None:
    payload = _payload()
    payload["target"] = [
        {"target_type": "major", "target_id": ACTIVE_MAJOR_ID},
        {"target_type": "class", "target_id": ACTIVE_CLASS_ID},
    ]
    response = _request("POST", "/api/v1/exams", json=payload)
    assert response.status_code == 422


def test_invalid_target_creation_leaves_no_exam() -> None:
    def inspect(session: Session) -> None:
        assert session.scalar(select(func.count(Exam.id))) == 5

    response = _request(
        "POST",
        "/api/v1/exams",
        json=_payload(target_type="major", target_id=999),
        user_id=TEACHER_USER_ID,
        inspect=inspect,
    )
    assert response.status_code == 404


def test_exam_list_is_paginated_filterable_and_teacher_owned() -> None:
    admin = _request("GET", "/api/v1/exams?page=2&page_size=2")
    teacher = _request(
        "GET",
        "/api/v1/exams?keyword=Linux&status=draft",
        user_id=TEACHER_USER_ID,
    )
    assert admin.status_code == 200
    assert admin.json()["total"] == 5
    assert len(admin.json()["items"]) == 2
    assert teacher.status_code == 200
    assert teacher.json()["total"] == 1
    assert teacher.json()["items"][0]["creator"]["id"] == TEACHER_USER_ID


def test_detail_returns_paper_target_creator_and_snapshot_summary() -> None:
    response = _request("GET", f"/api/v1/exams/{TEACHER_PUBLISHED_EXAM_ID}")
    assert response.status_code == 200
    body = response.json()
    assert body["paper"]["id"] == TEACHER_ACTIVE_PAPER_ID
    assert body["target"]["name"] == "全部学生"
    assert body["creator"]["id"] == TEACHER_USER_ID
    assert body["snapshot_question_count"] == 1


def test_teacher_cannot_see_or_edit_another_teachers_exam() -> None:
    detail = _request(
        "GET",
        f"/api/v1/exams/{OTHER_TEACHER_DRAFT_EXAM_ID}",
        user_id=TEACHER_USER_ID,
    )
    update = _request(
        "PUT",
        f"/api/v1/exams/{OTHER_TEACHER_DRAFT_EXAM_ID}",
        json=_payload(),
        user_id=TEACHER_USER_ID,
    )
    assert detail.status_code == 404
    assert update.status_code == 404


def test_admin_can_manage_teacher_exam() -> None:
    response = _request(
        "PUT",
        f"/api/v1/exams/{TEACHER_DRAFT_EXAM_ID}",
        json={**_payload(), "name": "管理员修改考试"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "管理员修改考试"
    assert response.json()["creator"]["id"] == TEACHER_USER_ID


def test_draft_update_revalidates_and_replaces_target() -> None:
    response = _request(
        "PUT",
        f"/api/v1/exams/{TEACHER_DRAFT_EXAM_ID}",
        json={
            **_payload(target_type="major", target_id=ACTIVE_MAJOR_ID),
            "name": "更新后的考试",
            "pass_score": "5.50",
        },
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "更新后的考试"
    assert Decimal(response.json()["pass_score"]) == Decimal("5.50")
    assert response.json()["target"]["type"] == "major"


def test_target_can_be_set_independently_on_draft() -> None:
    response = _request(
        "PUT",
        f"/api/v1/exams/{TEACHER_NO_TARGET_EXAM_ID}/target",
        json={"target_type": "all", "target_id": None},
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 200
    assert response.json()["target"]["name"] == "全部学生"


@pytest.mark.parametrize(
    ("method", "suffix", "json"),
    [
        ("PUT", "", _payload()),
        ("PUT", "/target", {"target_type": "all", "target_id": None}),
    ],
)
def test_published_exam_is_frozen(
    method: str,
    suffix: str,
    json: dict[str, object],
) -> None:
    response = _request(
        method,
        f"/api/v1/exams/{TEACHER_PUBLISHED_EXAM_ID}{suffix}",
        json=json,
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 409


def test_publish_generates_complete_snapshot_and_rejects_duplicate_publish() -> None:
    async def scenario(client: AsyncClient) -> None:
        headers = _headers(TEACHER_USER_ID)
        publish = await client.post(
            f"/api/v1/exams/{TEACHER_DRAFT_EXAM_ID}/publish",
            headers=headers,
        )
        assert publish.status_code == 200
        body = publish.json()
        assert body["status"] == "published"
        assert body["published_at"] is not None
        assert Decimal(body["total_score"]) == Decimal("10.00")
        assert body["snapshot_question_count"] == 3

        snapshots = await client.get(
            f"/api/v1/exams/{TEACHER_DRAFT_EXAM_ID}/questions",
            headers=headers,
        )
        assert snapshots.status_code == 200
        items = snapshots.json()
        assert [item["question_type"] for item in items] == [
            "single_choice",
            "multiple_choice",
            "true_false",
        ]
        assert [Decimal(item["score"]) for item in items] == [
            Decimal("2.50"),
            Decimal("5.00"),
            Decimal("2.50"),
        ]
        assert [item["sort_order"] for item in items] == [1, 2, 3]
        assert items[0]["options"][0]["key"] == "A"
        assert items[0]["correct_answer"] == ["A"]
        assert items[0]["analysis"].endswith("解析")
        assert items[2]["options"] is None

        repeated = await client.post(
            f"/api/v1/exams/{TEACHER_DRAFT_EXAM_ID}/publish",
            headers=headers,
        )
        assert repeated.status_code == 409
        snapshots_again = await client.get(
            f"/api/v1/exams/{TEACHER_DRAFT_EXAM_ID}/questions",
            headers=headers,
        )
        assert len(snapshots_again.json()) == 3

    _run_scenario(scenario)


def test_exam_without_target_cannot_be_published() -> None:
    response = _request(
        "POST",
        f"/api/v1/exams/{TEACHER_NO_TARGET_EXAM_ID}/publish",
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 409


def test_corrupt_paper_data_cannot_be_published() -> None:
    response = _request(
        "POST",
        f"/api/v1/exams/{CORRUPT_PAPER_EXAM_ID}/publish",
        user_id=TEACHER_USER_ID,
    )
    assert response.status_code == 409


def test_target_disabled_after_draft_creation_blocks_publish() -> None:
    async def scenario(client: AsyncClient) -> None:
        with Session(engine_ref[0]) as session:
            target_class = session.get(Class, ACTIVE_CLASS_ID)
            assert target_class is not None
            target_class.status = RecordStatus.DISABLED
            session.commit()
        response = await client.post(
            f"/api/v1/exams/{TEACHER_DRAFT_EXAM_ID}/publish",
            headers=_headers(TEACHER_USER_ID),
        )
        assert response.status_code == 409

    engine_ref: list[object] = []

    async def custom_run() -> None:
        engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        engine_ref.append(engine)
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            _seed_test_data(session)
            session.commit()

        async def override() -> AsyncIterator[AsyncSession]:
            with Session(engine, expire_on_commit=False) as session:
                yield cast(AsyncSession, AsyncSessionAdapter(session))

        app.dependency_overrides[get_db_session] = override
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
            ) as client:
                await scenario(client)
        finally:
            app.dependency_overrides.pop(get_db_session, None)
            engine.dispose()

    asyncio.run(custom_run())


def test_snapshot_generation_failure_rolls_back_exam_and_snapshots(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = service._snapshot_from_paper_question
    call_count = 0

    def fail_on_second(item: PaperQuestion) -> ExamQuestion:
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise ResourceConflictError("模拟快照生成失败")
        return original(item)

    monkeypatch.setattr(service, "_snapshot_from_paper_question", fail_on_second)

    def inspect(session: Session) -> None:
        exam = session.get(Exam, TEACHER_DRAFT_EXAM_ID)
        assert exam is not None
        assert exam.status == ExamStatus.DRAFT
        count = session.scalar(
            select(func.count(ExamQuestion.id)).where(
                ExamQuestion.exam_id == TEACHER_DRAFT_EXAM_ID
            )
        )
        assert count == 0

    response = _request(
        "POST",
        f"/api/v1/exams/{TEACHER_DRAFT_EXAM_ID}/publish",
        user_id=TEACHER_USER_ID,
        inspect=inspect,
    )
    assert response.status_code == 409


def test_published_snapshot_is_independent_from_question_and_paper_changes() -> None:
    engine_ref: list[object] = []

    async def scenario(client: AsyncClient) -> None:
        headers = _headers(TEACHER_USER_ID)
        publish = await client.post(
            f"/api/v1/exams/{TEACHER_DRAFT_EXAM_ID}/publish",
            headers=headers,
        )
        assert publish.status_code == 200
        before = (
            await client.get(
                f"/api/v1/exams/{TEACHER_DRAFT_EXAM_ID}/questions",
                headers=headers,
            )
        ).json()

        with Session(engine_ref[0]) as session:
            question = session.get(Question, 100)
            assert question is not None
            question.content = "原题已被修改"
            question.correct_answer = ["B"]
            question.options[0].option_content = "原选项已被修改"
            paper = session.get(Paper, TEACHER_ACTIVE_PAPER_ID)
            assert paper is not None
            paper.status = PaperStatus.DRAFT
            paper.paper_questions[0].score = Decimal("9.00")
            paper.paper_questions[0].sort_order = -1
            paper.paper_questions[1].sort_order = -2
            session.flush()
            paper.paper_questions[0].sort_order = 2
            paper.paper_questions[1].sort_order = 1
            paper.total_score = Decimal("16.50")
            session.commit()

        after_response = await client.get(
            f"/api/v1/exams/{TEACHER_DRAFT_EXAM_ID}/questions",
            headers=headers,
        )
        exam_response = await client.get(
            f"/api/v1/exams/{TEACHER_DRAFT_EXAM_ID}",
            headers=headers,
        )
        assert after_response.status_code == 200
        assert after_response.json() == before
        assert Decimal(exam_response.json()["total_score"]) == Decimal("10.00")

    async def run() -> None:
        engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        engine_ref.append(engine)
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            _seed_test_data(session)
            session.commit()

        async def override() -> AsyncIterator[AsyncSession]:
            with Session(engine, expire_on_commit=False) as session:
                yield cast(AsyncSession, AsyncSessionAdapter(session))

        app.dependency_overrides[get_db_session] = override
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
            ) as client:
                await scenario(client)
        finally:
            app.dependency_overrides.pop(get_db_session, None)
            engine.dispose()

    asyncio.run(run())


def test_student_cannot_read_snapshot_management_api() -> None:
    response = _request(
        "GET",
        f"/api/v1/exams/{TEACHER_PUBLISHED_EXAM_ID}/questions",
        user_id=STUDENT_USER_ID,
    )
    assert response.status_code == 403


def test_no_exam_question_mutation_api_is_registered() -> None:
    response = _request(
        "PUT",
        f"/api/v1/exams/{TEACHER_PUBLISHED_EXAM_ID}/questions",
        json={},
    )
    assert response.status_code == 405
    assert not any(
        route.path == "/api/v1/exams/{exam_id}/questions"
        and {"PUT", "PATCH", "POST", "DELETE"}.intersection(route.methods or set())
        for route in app.routes
    )


@pytest.mark.parametrize(
    ("status", "now", "expected"),
    [
        (ExamStatus.DRAFT, datetime(2026, 7, 30, 0, 0), ExamRuntimeStatus.DRAFT),
        (
            ExamStatus.PUBLISHED,
            datetime(2026, 7, 30, 0, 0),
            ExamRuntimeStatus.NOT_STARTED,
        ),
        (
            ExamStatus.PUBLISHED,
            datetime(2026, 7, 30, 2, 0),
            ExamRuntimeStatus.IN_PROGRESS,
        ),
        (
            ExamStatus.PUBLISHED,
            datetime(2026, 7, 30, 3, 0),
            ExamRuntimeStatus.ENDED,
        ),
        (
            ExamStatus.FINISHED,
            datetime(2026, 7, 30, 2, 0),
            ExamRuntimeStatus.FINISHED,
        ),
    ],
)
def test_runtime_status_is_derived_without_persisting_running(
    status: ExamStatus,
    now: datetime,
    expected: ExamRuntimeStatus,
) -> None:
    assert (
        calculate_runtime_status(
            status,
            datetime(2026, 7, 30, 1, 0),
            datetime(2026, 7, 30, 3, 0),
            now=now,
        )
        == expected
    )


@pytest.mark.parametrize(
    ("target_type", "target_id", "expected"),
    [
        (ExamTargetType.ALL, None, True),
        (ExamTargetType.MAJOR, ACTIVE_MAJOR_ID, True),
        (ExamTargetType.CLASS, ACTIVE_CLASS_ID, True),
        (ExamTargetType.MAJOR, DISABLED_MAJOR_ID, False),
        (ExamTargetType.CLASS, DISABLED_CLASS_ID, False),
    ],
)
def test_future_student_target_matching_rule(
    target_type: ExamTargetType,
    target_id: int | None,
    expected: bool,
) -> None:
    assert (
        service.student_matches_target(
            target_type,
            target_id,
            student_major_id=ACTIVE_MAJOR_ID,
            student_class_id=ACTIVE_CLASS_ID,
        )
        is expected
    )
