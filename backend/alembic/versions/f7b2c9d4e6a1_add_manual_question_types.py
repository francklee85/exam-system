"""add manual question types

Revision ID: f7b2c9d4e6a1
Revises: e4a9b7c2d5f1
Create Date: 2026-07-24 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f7b2c9d4e6a1"
down_revision: str | None = "e4a9b7c2d5f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "questions",
        sa.Column("reference_answer", sa.Text(), nullable=True),
    )
    op.alter_column(
        "questions",
        "correct_answer",
        existing_type=sa.JSON(),
        nullable=True,
    )
    op.add_column(
        "exam_questions",
        sa.Column("reference_answer", sa.Text(), nullable=True),
    )
    op.alter_column(
        "exam_questions",
        "correct_answer",
        existing_type=sa.JSON(),
        nullable=True,
    )


def downgrade() -> None:
    connection = op.get_bind()
    null_question_answers = connection.scalar(
        sa.text("SELECT COUNT(*) FROM questions WHERE correct_answer IS NULL")
    )
    null_snapshot_answers = connection.scalar(
        sa.text("SELECT COUNT(*) FROM exam_questions WHERE correct_answer IS NULL")
    )
    if null_question_answers or null_snapshot_answers:
        raise RuntimeError(
            "Cannot downgrade manual question types while questions or exam snapshots "
            "with NULL correct_answer exist; remove or migrate those records explicitly."
        )

    op.alter_column(
        "exam_questions",
        "correct_answer",
        existing_type=sa.JSON(),
        nullable=False,
    )
    op.drop_column("exam_questions", "reference_answer")
    op.alter_column(
        "questions",
        "correct_answer",
        existing_type=sa.JSON(),
        nullable=False,
    )
    op.drop_column("questions", "reference_answer")
