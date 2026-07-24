from datetime import datetime
from decimal import Decimal

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.schema import UniqueConstraint

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
    StudentProfile,
    User,
    UserRole,
)
from app.modules.exams.enums import ExamStatus, ExamTargetType
from app.modules.papers.enums import PaperStatus
from app.modules.questions.enums import QuestionDifficulty, QuestionType

EXPECTED_TABLES = {
    "classes",
    "exam_answers",
    "exam_attempts",
    "exam_questions",
    "exam_targets",
    "exams",
    "majors",
    "paper_questions",
    "papers",
    "question_options",
    "questions",
    "roles",
    "student_profiles",
    "user_roles",
    "users",
}


def _unique_column_sets(table_name: str) -> set[tuple[str, ...]]:
    table = Base.metadata.tables[table_name]
    return {
        tuple(constraint.columns.keys())
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }


def test_model_metadata_matches_current_scope() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES
    assert set(Base.metadata.tables["users"].columns.keys()) == {
        "id",
        "username",
        "password_hash",
        "real_name",
        "status",
        "last_login_at",
        "created_at",
        "updated_at",
    }
    assert "password" not in Base.metadata.tables["users"].columns
    assert "major_id" not in Base.metadata.tables["student_profiles"].columns

    assert ("username",) in _unique_column_sets("users")
    assert ("code",) in _unique_column_sets("roles")
    assert ("user_id", "role_id") in _unique_column_sets("user_roles")
    assert {("name",), ("code",)} <= _unique_column_sets("majors")
    assert ("code",) in _unique_column_sets("classes")
    assert {("user_id",), ("student_no",)} <= _unique_column_sets("student_profiles")
    assert ("question_id", "option_key") in _unique_column_sets("question_options")
    assert ("paper_id", "question_id") in _unique_column_sets("paper_questions")
    assert ("paper_id", "sort_order") in _unique_column_sets("paper_questions")
    assert ("exam_id", "target_type", "target_id") in _unique_column_sets(
        "exam_targets"
    )
    assert ("exam_id", "sort_order") in _unique_column_sets("exam_questions")
    assert ("exam_id", "student_user_id") in _unique_column_sets("exam_attempts")
    assert ("attempt_id", "exam_question_id") in _unique_column_sets("exam_answers")


def test_orm_relationships_can_be_queried() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        role = Role(
            id=1,
            code="student",
            name="学生",
            status=RecordStatus.ACTIVE,
        )
        user = User(
            id=1,
            username="student_001",
            password_hash="$2b$12$example-hash-not-plaintext",
            real_name="测试学生",
            status=RecordStatus.ACTIVE,
        )
        major = Major(
            id=1,
            code="CLOUD",
            name="云计算",
            status=RecordStatus.ACTIVE,
        )
        student_class = Class(
            id=1,
            major=major,
            name="云计算2501班",
            code="CLOUD-2501",
            enrollment_year=2025,
            status=RecordStatus.ACTIVE,
        )
        user.role_assignments.append(UserRole(id=1, role=role))
        user.student_profile = StudentProfile(
            id=1,
            student_no="20260001",
            student_class=student_class,
        )
        question = Question(
            id=1,
            question_type=QuestionType.SINGLE_CHOICE,
            content="pwd 命令的作用是什么？",
            correct_answer=["A"],
            difficulty=QuestionDifficulty.EASY,
            status=RecordStatus.ACTIVE,
            options=[
                QuestionOption(
                    id=1,
                    option_key="A",
                    option_content="显示当前目录",
                    sort_order=1,
                ),
                QuestionOption(
                    id=2,
                    option_key="B",
                    option_content="切换目录",
                    sort_order=2,
                ),
            ],
        )
        user.created_questions.append(question)
        paper = Paper(
            id=1,
            name="Linux 基础测试",
            total_score=Decimal("2.00"),
            status=PaperStatus.ACTIVE,
            paper_questions=[
                PaperQuestion(
                    id=1,
                    question=question,
                    score=Decimal("2.00"),
                    sort_order=1,
                )
            ],
        )
        user.created_papers.append(paper)
        user.created_exams.append(
            Exam(
                id=1,
                name="Linux 阶段考试",
                paper=paper,
                start_time=datetime(2026, 7, 30, 1, 0),
                end_time=datetime(2026, 7, 30, 3, 0),
                duration_minutes=90,
                pass_score=Decimal("1.20"),
                total_score=Decimal("2.00"),
                status=ExamStatus.PUBLISHED,
                targets=[
                    ExamTarget(
                        id=1,
                        target_type=ExamTargetType.CLASS,
                        target_id=1,
                    )
                ],
                snapshot_questions=[
                    ExamQuestion(
                        id=1,
                        original_question_id=1,
                        question_type=QuestionType.SINGLE_CHOICE,
                        content=question.content,
                        options=[
                            {
                                "key": "A",
                                "content": "显示当前目录",
                                "sort_order": 1,
                            },
                            {
                                "key": "B",
                                "content": "切换目录",
                                "sort_order": 2,
                            },
                        ],
                        correct_answer=["A"],
                        score=Decimal("2.00"),
                        sort_order=1,
                    )
                ],
            )
        )
        session.add(user)
        session.commit()
        session.expire_all()

        loaded_user = session.scalar(select(User).where(User.username == "student_001"))
        assert loaded_user is not None
        assert [item.code for item in loaded_user.roles] == ["student"]
        assert loaded_user.student_profile is not None
        assert loaded_user.student_profile.student_class.major.code == "CLOUD"

        loaded_role = session.scalar(select(Role).where(Role.code == "student"))
        assert loaded_role is not None
        assert [item.username for item in loaded_role.users] == ["student_001"]
        assert [item.code for item in major.classes] == ["CLOUD-2501"]
        assert loaded_user.created_questions[0].options[0].option_key == "A"
        assert loaded_user.created_questions[0].creator.username == "student_001"
        assert loaded_user.created_papers[0].paper_questions[0].question.id == 1
        assert question.paper_assignments[0].paper.name == "Linux 基础测试"
        assert loaded_user.created_exams[0].paper.name == "Linux 基础测试"
        assert loaded_user.created_exams[0].targets[0].target_id == 1
        assert loaded_user.created_exams[0].snapshot_questions[0].content == question.content
