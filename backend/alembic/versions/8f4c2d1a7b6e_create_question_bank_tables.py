"""create question bank tables

Revision ID: 8f4c2d1a7b6e
Revises: 3c899a842c89
Create Date: 2026-07-23 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "8f4c2d1a7b6e"
down_revision: str | None = "3c899a842c89"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "questions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
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
        sa.Column("correct_answer", sa.JSON(), nullable=False),
        sa.Column("analysis", sa.Text(), nullable=True),
        sa.Column(
            "difficulty",
            sa.Enum(
                "easy",
                "medium",
                "hard",
                name="question_difficulty",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "active",
                "disabled",
                name="record_status",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("created_by", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_questions_created_by_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_questions")),
    )
    op.create_index(
        "ix_questions_question_type",
        "questions",
        ["question_type"],
        unique=False,
    )
    op.create_index(
        "ix_questions_difficulty",
        "questions",
        ["difficulty"],
        unique=False,
    )
    op.create_index("ix_questions_status", "questions", ["status"], unique=False)
    op.create_index(
        "ix_questions_created_by",
        "questions",
        ["created_by"],
        unique=False,
    )
    op.create_table(
        "question_options",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("question_id", sa.BigInteger(), nullable=False),
        sa.Column("option_key", sa.String(length=10), nullable=False),
        sa.Column("option_content", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["questions.id"],
            name=op.f("fk_question_options_question_id_questions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_question_options")),
        sa.UniqueConstraint(
            "question_id",
            "option_key",
            name="uq_question_options_question_id_option_key",
        ),
    )
    op.create_index(
        "ix_question_options_question_id",
        "question_options",
        ["question_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("question_options")
    op.drop_table("questions")
