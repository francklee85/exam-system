"""create exam attempt tables

Revision ID: a8c4e2f6b1d9
Revises: f7b2c9d4e6a1
Create Date: 2026-07-24 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a8c4e2f6b1d9"
down_revision: str | None = "f7b2c9d4e6a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "exam_attempts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("exam_id", sa.BigInteger(), nullable=False),
        sa.Column("student_user_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "in_progress",
                "submitted",
                name="exam_attempt_status",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "grading_status",
            sa.Enum(
                "not_started",
                "pending_manual_grading",
                "graded",
                name="attempt_grading_status",
                native_enum=False,
                length=30,
            ),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("deadline_at", sa.DateTime(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("score", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("is_passed", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["exam_id"],
            ["exams.id"],
            name=op.f("fk_exam_attempts_exam_id_exams"),
        ),
        sa.ForeignKeyConstraint(
            ["student_user_id"],
            ["users.id"],
            name=op.f("fk_exam_attempts_student_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exam_attempts")),
        sa.UniqueConstraint(
            "exam_id",
            "student_user_id",
            name="uq_exam_attempts_exam_id_student_user_id",
        ),
    )
    op.create_index(
        "ix_exam_attempts_exam_id",
        "exam_attempts",
        ["exam_id"],
        unique=False,
    )
    op.create_index(
        "ix_exam_attempts_student_user_id",
        "exam_attempts",
        ["student_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_exam_attempts_status",
        "exam_attempts",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_exam_attempts_deadline_at",
        "exam_attempts",
        ["deadline_at"],
        unique=False,
    )

    op.create_table(
        "exam_answers",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("attempt_id", sa.BigInteger(), nullable=False),
        sa.Column("exam_question_id", sa.BigInteger(), nullable=False),
        sa.Column("answer", sa.JSON(), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.Column(
            "score_awarded",
            sa.Numeric(precision=6, scale=2),
            nullable=True,
        ),
        sa.Column(
            "grading_status",
            sa.Enum(
                "not_graded",
                "pending",
                "graded",
                name="answer_grading_status",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("grader_id", sa.BigInteger(), nullable=True),
        sa.Column("grading_comment", sa.Text(), nullable=True),
        sa.Column("graded_at", sa.DateTime(), nullable=True),
        sa.Column("answered_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["exam_attempts.id"],
            name=op.f("fk_exam_answers_attempt_id_exam_attempts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["exam_question_id"],
            ["exam_questions.id"],
            name=op.f("fk_exam_answers_exam_question_id_exam_questions"),
        ),
        sa.ForeignKeyConstraint(
            ["grader_id"],
            ["users.id"],
            name=op.f("fk_exam_answers_grader_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exam_answers")),
        sa.UniqueConstraint(
            "attempt_id",
            "exam_question_id",
            name="uq_exam_answers_attempt_id_exam_question_id",
        ),
    )
    op.create_index(
        "ix_exam_answers_attempt_id",
        "exam_answers",
        ["attempt_id"],
        unique=False,
    )
    op.create_index(
        "ix_exam_answers_exam_question_id",
        "exam_answers",
        ["exam_question_id"],
        unique=False,
    )
    op.create_index(
        "ix_exam_answers_grader_id",
        "exam_answers",
        ["grader_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("exam_answers")
    op.drop_table("exam_attempts")
