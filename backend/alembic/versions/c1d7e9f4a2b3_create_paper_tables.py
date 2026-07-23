"""create paper tables

Revision ID: c1d7e9f4a2b3
Revises: 8f4c2d1a7b6e
Create Date: 2026-07-23 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c1d7e9f4a2b3"
down_revision: str | None = "8f4c2d1a7b6e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "papers",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("total_score", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "active",
                "disabled",
                name="paper_status",
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
            name=op.f("fk_papers_created_by_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_papers")),
    )
    op.create_index("ix_papers_status", "papers", ["status"], unique=False)
    op.create_index("ix_papers_created_by", "papers", ["created_by"], unique=False)

    op.create_table(
        "paper_questions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("paper_id", sa.BigInteger(), nullable=False),
        sa.Column("question_id", sa.BigInteger(), nullable=False),
        sa.Column("score", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("score > 0", name=op.f("ck_paper_questions_score_positive")),
        sa.ForeignKeyConstraint(
            ["paper_id"],
            ["papers.id"],
            name=op.f("fk_paper_questions_paper_id_papers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["questions.id"],
            name=op.f("fk_paper_questions_question_id_questions"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_paper_questions")),
        sa.UniqueConstraint(
            "paper_id",
            "question_id",
            name="uq_paper_questions_paper_id_question_id",
        ),
        sa.UniqueConstraint(
            "paper_id",
            "sort_order",
            name="uq_paper_questions_paper_id_sort_order",
        ),
    )
    op.create_index(
        "ix_paper_questions_paper_id",
        "paper_questions",
        ["paper_id"],
        unique=False,
    )
    op.create_index(
        "ix_paper_questions_question_id",
        "paper_questions",
        ["question_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("paper_questions")
    op.drop_table("papers")
