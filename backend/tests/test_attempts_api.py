import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import datetime, timedelta
from decimal import Decimal
from typing import cast

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import Select, create_engine, func, select
from sqlalchemy.engine import Engine, Result, ScalarResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.enums import RecordStatus
from app.db.mixins import utc_now
from app.db.models import (
    Base,
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
from app.db.session import get_db_session
from app.main import app
from app.modules.auth.security import create_access_token
from app.modules.exams.enums import ExamStatus, ExamTargetType
from app.modules.papers.enums import PaperStatus
from app.modules.questions.enums import QuestionType

ADMIN_ID = 1
TEACHER_ID = 2
STUDENT_ID = 3
OTHER_STUDENT_ID = 4
OTHER_MAJOR_STUDENT_ID = 5
NO_PROFILE_STUDENT_ID = 6

CLOUD_MAJOR_ID = 10
OTHER_MAJOR_ID = 11
CLOUD_CLASS_ID = 20
CLOUD_OTHER_CLASS_ID = 21
OTHER_MAJOR_CLASS_ID = 22

ALL_EXAM_ID = 100
MAJOR_EXAM_ID = 101
CLASS_EXAM_ID = 102
OTHER_MAJOR_EXAM_ID = 103
OTHER_CLASS_EXAM_ID = 104
FUTURE_EXAM_ID = 105
ENDED_EXAM_ID = 106
DRAFT_EXAM_ID = 107
CAPPED_DEADLINE_EXAM_ID = 108


class AsyncSessionAdapter:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._next_attempt_id = int(
            session.scalar(select(func.max(ExamAttempt.id))) or 9_999
        ) + 1
        self._next_answer_id = int(
            session.scalar(select(func.max(ExamAnswer.id))) or 19_999
        ) + 1

    def _assign_id(self, instance: object) -> None:
        if isinstance(instance, ExamAttempt) and instance.id is None:
            instance.id = self._next_attempt_id
            self._next_attempt_id += 1
        elif isinstance(instance, ExamAnswer) and instance.id is None:
            instance.id = self._next_answer_id
            self._next_answer_id += 1

    def _assign_pending_ids(self) -> None:
        for instance in list(self._session.new):
            self._assign_id(instance)

    def add(self, instance: object) -> None:
        self._assign_id(instance)
        self._session.add(instance)

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


def _user(
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


def _snapshots(exam_id: int) -> list[ExamQuestion]:
    return [
        ExamQuestion(
            id=exam_id * 10 + 1,
            question_type=QuestionType.SINGLE_CHOICE,
            content="快照单选题",
            options=[
                {"key": "A", "content": "选项 A", "sort_order": 1},
                {"key": "B", "content": "选项 B", "sort_order": 2},
            ],
            correct_answer=["A"],
            reference_answer=None,
            analysis="单选解析（学生不可见）",
            score=Decimal("1.00"),
            sort_order=1,
        ),
        ExamQuestion(
            id=exam_id * 10 + 2,
            question_type=QuestionType.MULTIPLE_CHOICE,
            content="快照多选题",
            options=[
                {"key": "A", "content": "选项 A", "sort_order": 1},
                {"key": "B", "content": "选项 B", "sort_order": 2},
                {"key": "C", "content": "选项 C", "sort_order": 3},
            ],
            correct_answer=["A", "C"],
            reference_answer=None,
            analysis="多选解析（学生不可见）",
            score=Decimal("2.00"),
            sort_order=2,
        ),
        ExamQuestion(
            id=exam_id * 10 + 3,
            question_type=QuestionType.TRUE_FALSE,
            content="快照判断题",
            options=None,
            correct_answer=["true"],
            reference_answer=None,
            analysis="判断解析（学生不可见）",
            score=Decimal("1.00"),
            sort_order=3,
        ),
        ExamQuestion(
            id=exam_id * 10 + 4,
            question_type=QuestionType.FILL_BLANK,
            content="快照填空题",
            options=None,
            correct_answer=None,
            reference_answer="填空参考答案（学生不可见）",
            analysis="填空解析（学生不可见）",
            score=Decimal("4.00"),
            sort_order=4,
        ),
        ExamQuestion(
            id=exam_id * 10 + 5,
            question_type=QuestionType.SUBJECTIVE,
            content="快照主观题",
            options=None,
            correct_answer=None,
            reference_answer="主观参考答案（学生不可见）",
            analysis="主观解析（学生不可见）",
            score=Decimal("7.00"),
            sort_order=5,
        ),
    ]


def _exam(
    exam_id: int,
    name: str,
    paper: Paper,
    status: ExamStatus,
    target_type: ExamTargetType,
    target_id: int | None,
    *,
    start_offset_minutes: int = -10,
    end_offset_minutes: int = 120,
) -> Exam:
    now = utc_now()
    return Exam(
        id=exam_id,
        name=name,
        paper=paper,
        description=f"{name}说明",
        start_time=now + timedelta(minutes=start_offset_minutes),
        end_time=now + timedelta(minutes=end_offset_minutes),
        duration_minutes=90,
        pass_score=Decimal("9.00"),
        total_score=Decimal("15.00"),
        status=status,
        published_at=now - timedelta(days=1) if status != ExamStatus.DRAFT else None,
        targets=[
            ExamTarget(
                id=exam_id,
                target_type=target_type,
                target_id=target_id,
            )
        ],
        snapshot_questions=_snapshots(exam_id) if status != ExamStatus.DRAFT else [],
    )


def _seed(session: Session) -> None:
    admin_role = Role(id=80, code="admin", name="管理员")
    teacher_role = Role(id=81, code="teacher", name="教师")
    student_role = Role(id=82, code="student", name="学生")
    admin = _user(ADMIN_ID, "admin", admin_role, 1)
    teacher = _user(TEACHER_ID, "teacher", teacher_role, 2)
    student = _user(STUDENT_ID, "student", student_role, 3)
    other_student = _user(OTHER_STUDENT_ID, "other_student", student_role, 4)
    other_major_student = _user(
        OTHER_MAJOR_STUDENT_ID,
        "aigc_student",
        student_role,
        5,
    )
    no_profile_student = _user(
        NO_PROFILE_STUDENT_ID,
        "no_profile",
        student_role,
        6,
    )

    cloud = Major(
        id=CLOUD_MAJOR_ID,
        name="云计算",
        code="CLOUD",
        status=RecordStatus.ACTIVE,
    )
    other_major = Major(
        id=OTHER_MAJOR_ID,
        name="AIGC",
        code="AIGC",
        status=RecordStatus.ACTIVE,
    )
    cloud_class = Class(
        id=CLOUD_CLASS_ID,
        major=cloud,
        name="云计算2501班",
        code="CLOUD-2501",
        status=RecordStatus.ACTIVE,
    )
    cloud_other_class = Class(
        id=CLOUD_OTHER_CLASS_ID,
        major=cloud,
        name="云计算2502班",
        code="CLOUD-2502",
        status=RecordStatus.ACTIVE,
    )
    other_class = Class(
        id=OTHER_MAJOR_CLASS_ID,
        major=other_major,
        name="AIGC2501班",
        code="AIGC-2501",
        status=RecordStatus.ACTIVE,
    )
    student.student_profile = StudentProfile(
        id=30,
        student_no="20260001",
        student_class=cloud_class,
    )
    other_student.student_profile = StudentProfile(
        id=31,
        student_no="20260002",
        student_class=cloud_other_class,
    )
    other_major_student.student_profile = StudentProfile(
        id=32,
        student_no="20260003",
        student_class=other_class,
    )

    paper = Paper(
        id=50,
        name="五题型快照试卷",
        total_score=Decimal("15.00"),
        status=PaperStatus.ACTIVE,
    )
    exams = [
        _exam(ALL_EXAM_ID, "全部学生考试", paper, ExamStatus.PUBLISHED, ExamTargetType.ALL, None),
        _exam(
            MAJOR_EXAM_ID,
            "云计算专业考试",
            paper,
            ExamStatus.PUBLISHED,
            ExamTargetType.MAJOR,
            CLOUD_MAJOR_ID,
        ),
        _exam(
            CLASS_EXAM_ID,
            "云计算2501班考试",
            paper,
            ExamStatus.PUBLISHED,
            ExamTargetType.CLASS,
            CLOUD_CLASS_ID,
        ),
        _exam(
            OTHER_MAJOR_EXAM_ID,
            "其他专业考试",
            paper,
            ExamStatus.PUBLISHED,
            ExamTargetType.MAJOR,
            OTHER_MAJOR_ID,
        ),
        _exam(
            OTHER_CLASS_EXAM_ID,
            "同专业其他班考试",
            paper,
            ExamStatus.PUBLISHED,
            ExamTargetType.CLASS,
            CLOUD_OTHER_CLASS_ID,
        ),
        _exam(
            FUTURE_EXAM_ID,
            "未来考试",
            paper,
            ExamStatus.PUBLISHED,
            ExamTargetType.ALL,
            None,
            start_offset_minutes=60,
            end_offset_minutes=180,
        ),
        _exam(
            ENDED_EXAM_ID,
            "已结束考试",
            paper,
            ExamStatus.PUBLISHED,
            ExamTargetType.ALL,
            None,
            start_offset_minutes=-180,
            end_offset_minutes=-60,
        ),
        _exam(
            DRAFT_EXAM_ID,
            "草稿考试",
            paper,
            ExamStatus.DRAFT,
            ExamTargetType.ALL,
            None,
        ),
        _exam(
            CAPPED_DEADLINE_EXAM_ID,
            "临近结束考试",
            paper,
            ExamStatus.PUBLISHED,
            ExamTargetType.ALL,
            None,
            start_offset_minutes=-10,
            end_offset_minutes=30,
        ),
    ]
    teacher.created_papers.append(paper)
    teacher.created_exams.extend(exams)
    session.add_all(
        [
            admin,
            teacher,
            student,
            other_student,
            other_major_student,
            no_profile_student,
            cloud_class,
            cloud_other_class,
            other_class,
        ]
    )


def _headers(user_id: int | None) -> dict[str, str] | None:
    if user_id is None:
        return None
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}


def _run_scenario(
    callback: Callable[[AsyncClient, Engine], Awaitable[None]],
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
            _seed(session)
            session.commit()

        async def override_db_session() -> AsyncIterator[AsyncSession]:
            with Session(engine, expire_on_commit=False) as session:
                yield cast(AsyncSession, AsyncSessionAdapter(session))

        app.dependency_overrides[get_db_session] = override_db_session
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                await callback(client, engine)
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
    user_id: int | None = STUDENT_ID,
    inspect: Callable[[Session], None] | None = None,
) -> Response:
    captured: list[Response] = []

    async def scenario(client: AsyncClient, _engine: Engine) -> None:
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


def test_my_exams_matches_all_major_and_class_targets() -> None:
    response = _request("GET", "/api/v1/my-exams?page=1&page_size=100")
    assert response.status_code == 200
    ids = {item["exam_id"] for item in response.json()["items"]}
    assert {ALL_EXAM_ID, MAJOR_EXAM_ID, CLASS_EXAM_ID}.issubset(ids)
    assert OTHER_MAJOR_EXAM_ID not in ids
    assert OTHER_CLASS_EXAM_ID not in ids
    assert DRAFT_EXAM_ID not in ids


def test_my_exams_is_paginated_and_returns_attempt_summary() -> None:
    response = _request("GET", "/api/v1/my-exams?page=2&page_size=2")
    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 2
    assert body["page_size"] == 2
    assert body["total"] >= 5
    assert len(body["items"]) == 2
    assert body["items"][0]["attempt_id"] is None


@pytest.mark.parametrize(
    ("user_id", "expected"),
    [(ADMIN_ID, 403), (TEACHER_ID, 403), (None, 401)],
)
def test_only_students_can_access_my_exams(
    user_id: int | None,
    expected: int,
) -> None:
    assert _request("GET", "/api/v1/my-exams", user_id=user_id).status_code == expected


def test_student_without_profile_gets_clear_conflict() -> None:
    response = _request(
        "GET",
        "/api/v1/my-exams",
        user_id=NO_PROFILE_STUDENT_ID,
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "当前账号未配置学生档案"


def test_disabled_target_entity_does_not_hide_published_exam() -> None:
    async def scenario(client: AsyncClient, engine: Engine) -> None:
        with Session(engine) as session:
            major = session.get(Major, CLOUD_MAJOR_ID)
            major.status = RecordStatus.DISABLED
            target_class = session.get(Class, CLOUD_CLASS_ID)
            target_class.status = RecordStatus.DISABLED
            session.commit()
        response = await client.get("/api/v1/my-exams?page_size=100", headers=_headers(STUDENT_ID))
        ids = {item["exam_id"] for item in response.json()["items"]}
        assert MAJOR_EXAM_ID in ids
        assert CLASS_EXAM_ID in ids

    _run_scenario(scenario)


def test_my_exam_detail_requires_published_and_matching_target() -> None:
    visible = _request("GET", f"/api/v1/my-exams/{CLASS_EXAM_ID}")
    hidden = _request("GET", f"/api/v1/my-exams/{OTHER_CLASS_EXAM_ID}")
    draft = _request("GET", f"/api/v1/my-exams/{DRAFT_EXAM_ID}")
    assert visible.status_code == 200
    assert visible.json()["exam_id"] == CLASS_EXAM_ID
    assert hidden.status_code == 404
    assert draft.status_code == 404


@pytest.mark.parametrize(
    ("exam_id", "message"),
    [
        (FUTURE_EXAM_ID, "考试尚未开始"),
        (ENDED_EXAM_ID, "考试已结束"),
    ],
)
def test_exam_can_only_start_inside_time_window(exam_id: int, message: str) -> None:
    response = _request("POST", f"/api/v1/my-exams/{exam_id}/start")
    assert response.status_code == 409
    assert response.json()["detail"] == message


def test_target_mismatch_cannot_start_exam() -> None:
    response = _request("POST", f"/api/v1/my-exams/{OTHER_MAJOR_EXAM_ID}/start")
    assert response.status_code == 404


def test_start_creates_attempt_with_safe_five_type_snapshot() -> None:
    def inspect(session: Session) -> None:
        attempt = session.scalar(select(ExamAttempt))
        assert attempt is not None
        assert attempt.status.value == "in_progress"
        assert attempt.score is None
        assert attempt.is_passed is None

    response = _request(
        "POST",
        f"/api/v1/my-exams/{ALL_EXAM_ID}/start",
        inspect=inspect,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "in_progress"
    assert body["grading_status"] == "not_started"
    assert len(body["questions"]) == 5
    assert [item["sort_order"] for item in body["questions"]] == [1, 2, 3, 4, 5]
    assert [item["question_type"] for item in body["questions"]] == [
        "single_choice",
        "multiple_choice",
        "true_false",
        "fill_blank",
        "subjective",
    ]
    serialized = response.text
    for forbidden in (
        "correct_answer",
        "reference_answer",
        "analysis",
        "original_question_id",
        "is_correct",
        "score_awarded",
    ):
        assert forbidden not in serialized
    assert body["questions"][2]["options"] is None
    assert body["questions"][3]["options"] is None
    assert body["questions"][4]["options"] is None


def test_deadline_is_duration_based_and_never_after_exam_end() -> None:
    async def scenario(client: AsyncClient, _engine: Engine) -> None:
        normal = await client.post(
            f"/api/v1/my-exams/{ALL_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        capped = await client.post(
            f"/api/v1/my-exams/{CAPPED_DEADLINE_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        detail = await client.get(
            f"/api/v1/my-exams/{CAPPED_DEADLINE_EXAM_ID}",
            headers=_headers(STUDENT_ID),
        )
        normal_body = normal.json()
        capped_body = capped.json()
        normal_delta = (
            _parse_datetime(normal_body["deadline_at"])
            - _parse_datetime(normal_body["started_at"])
        )
        assert timedelta(minutes=89, seconds=55) <= normal_delta <= timedelta(minutes=90)
        assert capped_body["deadline_at"] == detail.json()["end_time"]

    _run_scenario(scenario)


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


def test_repeated_start_returns_same_attempt_and_only_one_row() -> None:
    async def scenario(client: AsyncClient, engine: Engine) -> None:
        first = await client.post(
            f"/api/v1/my-exams/{ALL_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        second = await client.post(
            f"/api/v1/my-exams/{ALL_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        assert first.json()["attempt_id"] == second.json()["attempt_id"]
        with Session(engine) as session:
            assert session.scalar(select(func.count(ExamAttempt.id))) == 1

    _run_scenario(scenario)


def test_attempt_access_survives_student_class_change_after_start() -> None:
    async def scenario(client: AsyncClient, engine: Engine) -> None:
        started = await client.post(
            f"/api/v1/my-exams/{CLASS_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        attempt_id = started.json()["attempt_id"]
        with Session(engine) as session:
            profile = session.scalar(
                select(StudentProfile).where(StudentProfile.user_id == STUDENT_ID)
            )
            profile.class_id = OTHER_MAJOR_CLASS_ID
            session.commit()
        restored = await client.get(
            f"/api/v1/attempts/{attempt_id}",
            headers=_headers(STUDENT_ID),
        )
        assert restored.status_code == 200

    _run_scenario(scenario)


def test_student_cannot_read_another_students_attempt() -> None:
    async def scenario(client: AsyncClient, _engine: Engine) -> None:
        started = await client.post(
            f"/api/v1/my-exams/{ALL_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        response = await client.get(
            f"/api/v1/attempts/{started.json()['attempt_id']}",
            headers=_headers(OTHER_STUDENT_ID),
        )
        assert response.status_code == 404

    _run_scenario(scenario)


@pytest.mark.parametrize(
    ("question_offset", "answer", "expected", "status_code"),
    [
        (1, ["A"], ["A"], 200),
        (1, ["A", "B"], None, 400),
        (1, ["Z"], None, 400),
        (2, ["A"], ["A"], 200),
        (2, ["C", "A", "A"], ["A", "C"], 200),
        (2, ["Z"], None, 400),
        (3, ["TRUE"], ["true"], 200),
        (3, ["false"], ["false"], 200),
        (3, ["yes"], None, 400),
        (4, ["  root  "], ["root"], 200),
        (5, ["  第一段\n第二段  "], ["第一段\n第二段"], 200),
    ],
)
def test_five_type_answer_validation_and_normalization(
    question_offset: int,
    answer: list[str],
    expected: list[str] | None,
    status_code: int,
) -> None:
    async def scenario(client: AsyncClient, _engine: Engine) -> None:
        started = await client.post(
            f"/api/v1/my-exams/{ALL_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        response = await client.put(
            f"/api/v1/attempts/{started.json()['attempt_id']}/answers/"
            f"{ALL_EXAM_ID * 10 + question_offset}",
            json={"answer": answer},
            headers=_headers(STUDENT_ID),
        )
        assert response.status_code == status_code
        if status_code == 200:
            assert response.json()["answer"] == expected

    _run_scenario(scenario)


@pytest.mark.parametrize("empty_answer", [None, [], [""], ["   "]])
def test_empty_answer_is_canonicalized_to_database_null(
    empty_answer: list[str] | None,
) -> None:
    def inspect(session: Session) -> None:
        answer = session.scalar(select(ExamAnswer))
        assert answer is not None
        assert answer.answer is None

    async def scenario(client: AsyncClient, _engine: Engine) -> None:
        started = await client.post(
            f"/api/v1/my-exams/{ALL_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        response = await client.put(
            f"/api/v1/attempts/{started.json()['attempt_id']}/answers/"
            f"{ALL_EXAM_ID * 10 + 4}",
            json={"answer": empty_answer},
            headers=_headers(STUDENT_ID),
        )
        assert response.status_code == 200
        assert response.json()["answer"] is None

    _run_scenario(scenario, inspect=inspect)


def test_manual_answer_length_is_bounded() -> None:
    async def scenario(client: AsyncClient, _engine: Engine) -> None:
        started = await client.post(
            f"/api/v1/my-exams/{ALL_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        response = await client.put(
            f"/api/v1/attempts/{started.json()['attempt_id']}/answers/"
            f"{ALL_EXAM_ID * 10 + 5}",
            json={"answer": ["x" * 20_001]},
            headers=_headers(STUDENT_ID),
        )
        assert response.status_code == 422

    _run_scenario(scenario)


def test_answer_upsert_updates_same_row_and_never_scores() -> None:
    def inspect(session: Session) -> None:
        answers = list(session.scalars(select(ExamAnswer)))
        assert len(answers) == 1
        assert answers[0].answer == ["修改后的回答"]
        assert answers[0].is_correct is None
        assert answers[0].score_awarded is None
        assert answers[0].grading_status.value == "not_graded"
        assert answers[0].grader_id is None
        assert answers[0].graded_at is None

    async def scenario(client: AsyncClient, _engine: Engine) -> None:
        started = await client.post(
            f"/api/v1/my-exams/{ALL_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        path = (
            f"/api/v1/attempts/{started.json()['attempt_id']}/answers/"
            f"{ALL_EXAM_ID * 10 + 5}"
        )
        first = await client.put(
            path,
            json={"answer": ["原回答"]},
            headers=_headers(STUDENT_ID),
        )
        second = await client.put(
            path,
            json={"answer": ["修改后的回答"]},
            headers=_headers(STUDENT_ID),
        )
        assert first.status_code == second.status_code == 200
        assert first.json()["answered_at"] <= second.json()["answered_at"]

    _run_scenario(scenario, inspect=inspect)


def test_all_five_saved_answers_are_restored_without_secrets() -> None:
    answers = {
        1: ["A"],
        2: ["A", "C"],
        3: ["true"],
        4: ["root"],
        5: ["一段完整回答"],
    }

    async def scenario(client: AsyncClient, _engine: Engine) -> None:
        started = await client.post(
            f"/api/v1/my-exams/{ALL_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        attempt_id = started.json()["attempt_id"]
        for offset, answer in answers.items():
            saved = await client.put(
                f"/api/v1/attempts/{attempt_id}/answers/{ALL_EXAM_ID * 10 + offset}",
                json={"answer": answer},
                headers=_headers(STUDENT_ID),
            )
            assert saved.status_code == 200
        restored = await client.get(
            f"/api/v1/attempts/{attempt_id}",
            headers=_headers(STUDENT_ID),
        )
        assert restored.status_code == 200
        assert {
            question["exam_question_id"] % 10: question["saved_answer"]
            for question in restored.json()["questions"]
        } == answers
        assert "correct_answer" not in restored.text
        assert "reference_answer" not in restored.text

    _run_scenario(scenario)


def test_cross_exam_question_and_other_attempt_write_are_rejected() -> None:
    async def scenario(client: AsyncClient, _engine: Engine) -> None:
        started = await client.post(
            f"/api/v1/my-exams/{ALL_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        attempt_id = started.json()["attempt_id"]
        cross_exam = await client.put(
            f"/api/v1/attempts/{attempt_id}/answers/{MAJOR_EXAM_ID * 10 + 1}",
            json={"answer": ["A"]},
            headers=_headers(STUDENT_ID),
        )
        other_student = await client.put(
            f"/api/v1/attempts/{attempt_id}/answers/{ALL_EXAM_ID * 10 + 1}",
            json={"answer": ["A"]},
            headers=_headers(OTHER_STUDENT_ID),
        )
        assert cross_exam.status_code == 404
        assert other_student.status_code == 404

    _run_scenario(scenario)


def test_deadline_rejection_does_not_modify_existing_answer() -> None:
    async def scenario(client: AsyncClient, engine: Engine) -> None:
        started = await client.post(
            f"/api/v1/my-exams/{ALL_EXAM_ID}/start",
            headers=_headers(STUDENT_ID),
        )
        attempt_id = started.json()["attempt_id"]
        path = f"/api/v1/attempts/{attempt_id}/answers/{ALL_EXAM_ID * 10 + 1}"
        assert (
            await client.put(
                path,
                json={"answer": ["A"]},
                headers=_headers(STUDENT_ID),
            )
        ).status_code == 200
        with Session(engine) as session:
            attempt = session.get(ExamAttempt, attempt_id)
            attempt.deadline_at = utc_now() - timedelta(seconds=1)
            session.commit()
        rejected = await client.put(
            path,
            json={"answer": ["B"]},
            headers=_headers(STUDENT_ID),
        )
        assert rejected.status_code == 409
        with Session(engine) as session:
            answer = session.scalar(select(ExamAnswer))
            assert answer.answer == ["A"]

    _run_scenario(scenario)


def test_student_openapi_schemas_do_not_contain_sensitive_answer_fields() -> None:
    schema = app.openapi()
    question_schema = schema["components"]["schemas"]["StudentExamQuestionResponse"]
    properties = question_schema["properties"]
    for forbidden in (
        "correct_answer",
        "reference_answer",
        "analysis",
        "original_question_id",
        "is_correct",
        "score_awarded",
    ):
        assert forbidden not in properties
    attempt_path = schema["paths"]["/api/v1/attempts/{attempt_id}"]["get"]
    assert attempt_path["responses"]["200"]["content"]["application/json"]["schema"]
