from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.schema import UniqueConstraint

from app.db.enums import RecordStatus
from app.db.models import (
    Base,
    Class,
    Major,
    Question,
    QuestionOption,
    Role,
    StudentProfile,
    User,
    UserRole,
)
from app.modules.questions.enums import QuestionDifficulty, QuestionType

EXPECTED_TABLES = {
    "classes",
    "majors",
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
        user.created_questions.append(
            Question(
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
