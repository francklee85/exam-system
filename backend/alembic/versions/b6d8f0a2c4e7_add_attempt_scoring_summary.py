"""add attempt scoring summary fields

Revision ID: b6d8f0a2c4e7
Revises: a8c4e2f6b1d9
Create Date: 2026-07-24 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b6d8f0a2c4e7"
down_revision: str | None = "a8c4e2f6b1d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "exam_attempts",
        sa.Column(
            "submit_reason",
            sa.Enum(
                "manual",
                "timeout",
                name="attempt_submit_reason",
                native_enum=False,
                length=20,
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "exam_attempts",
        sa.Column(
            "objective_score",
            sa.Numeric(precision=6, scale=2),
            nullable=True,
        ),
    )
    op.add_column(
        "exam_attempts",
        sa.Column(
            "manual_score",
            sa.Numeric(precision=6, scale=2),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_exam_attempts_grading_status",
        "exam_attempts",
        ["grading_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_exam_attempts_grading_status", table_name="exam_attempts")
    op.drop_column("exam_attempts", "manual_score")
    op.drop_column("exam_attempts", "objective_score")
    op.drop_column("exam_attempts", "submit_reason")
