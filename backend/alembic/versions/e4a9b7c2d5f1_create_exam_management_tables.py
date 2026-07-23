"""create exam management tables

Revision ID: e4a9b7c2d5f1
Revises: c1d7e9f4a2b3
Create Date: 2026-07-23 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e4a9b7c2d5f1"
down_revision: str | None = "c1d7e9f4a2b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "exams",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("paper_id", sa.BigInteger(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_time", sa.DateTime(), nullable=False),
        sa.Column("end_time", sa.DateTime(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("pass_score", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("total_score", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "published",
                "finished",
                name="exam_status",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "duration_minutes > 0",
            name=op.f("ck_exams_duration_positive"),
        ),
        sa.CheckConstraint(
            "pass_score >= 0",
            name=op.f("ck_exams_pass_score_non_negative"),
        ),
        sa.CheckConstraint(
            "total_score >= 0",
            name=op.f("ck_exams_total_score_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_exams_created_by_users"),
        ),
        sa.ForeignKeyConstraint(
            ["paper_id"],
            ["papers.id"],
            name=op.f("fk_exams_paper_id_papers"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exams")),
    )
    op.create_index("ix_exams_status", "exams", ["status"], unique=False)
    op.create_index("ix_exams_start_time", "exams", ["start_time"], unique=False)
    op.create_index("ix_exams_end_time", "exams", ["end_time"], unique=False)
    op.create_index("ix_exams_created_by", "exams", ["created_by"], unique=False)
    op.create_index("ix_exams_paper_id", "exams", ["paper_id"], unique=False)

    op.create_table(
        "exam_targets",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("exam_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "target_type",
            sa.Enum(
                "all",
                "major",
                "class",
                name="exam_target_type",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("target_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "(target_type = 'all' AND target_id IS NULL) OR "
            "(target_type IN ('major', 'class') AND target_id IS NOT NULL)",
            name=op.f("ck_exam_targets_target_reference_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["exam_id"],
            ["exams.id"],
            name=op.f("fk_exam_targets_exam_id_exams"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exam_targets")),
        sa.UniqueConstraint(
            "exam_id",
            "target_type",
            "target_id",
            name="uq_exam_targets_exam_id_target_type_target_id",
        ),
    )
    op.create_index(
        "ix_exam_targets_exam_id",
        "exam_targets",
        ["exam_id"],
        unique=False,
    )
    op.create_index(
        "ix_exam_targets_target_type_target_id",
        "exam_targets",
        ["target_type", "target_id"],
        unique=False,
    )

    op.create_table(
        "exam_questions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("exam_id", sa.BigInteger(), nullable=False),
        sa.Column("original_question_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "question_type",
            sa.Enum(
                "single_choice",
                "multiple_choice",
                "true_false",
                name="question_type",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("options", sa.JSON(), nullable=True),
        sa.Column("correct_answer", sa.JSON(), nullable=False),
        sa.Column("analysis", sa.Text(), nullable=True),
        sa.Column("score", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "score > 0",
            name=op.f("ck_exam_questions_score_positive"),
        ),
        sa.ForeignKeyConstraint(
            ["exam_id"],
            ["exams.id"],
            name=op.f("fk_exam_questions_exam_id_exams"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exam_questions")),
        sa.UniqueConstraint(
            "exam_id",
            "sort_order",
            name="uq_exam_questions_exam_id_sort_order",
        ),
    )
    op.create_index(
        "ix_exam_questions_exam_id",
        "exam_questions",
        ["exam_id"],
        unique=False,
    )
    op.create_index(
        "ix_exam_questions_original_question_id",
        "exam_questions",
        ["original_question_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("exam_questions")
    op.drop_table("exam_targets")
    op.drop_table("exams")
