from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import CreatedAtMixin, TimestampMixin
from app.modules.exams.enums import (
    ExamStatus,
    ExamTargetType,
    exam_status_type,
    exam_target_type,
)
from app.modules.questions.enums import QuestionType, question_type_column

if TYPE_CHECKING:
    from app.modules.attempts.models import ExamAnswer, ExamAttempt
    from app.modules.papers.models import Paper
    from app.modules.users.models import User


class Exam(TimestampMixin, Base):
    __tablename__ = "exams"
    __table_args__ = (
        CheckConstraint("duration_minutes > 0", name="duration_positive"),
        CheckConstraint("pass_score >= 0", name="pass_score_non_negative"),
        CheckConstraint("total_score >= 0", name="total_score_non_negative"),
        Index("ix_exams_status", "status"),
        Index("ix_exams_start_time", "start_time"),
        Index("ix_exams_end_time", "end_time"),
        Index("ix_exams_created_by", "created_by"),
        Index("ix_exams_paper_id", "paper_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    paper_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("papers.id"),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    pass_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    total_score: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    status: Mapped[ExamStatus] = mapped_column(
        exam_status_type(),
        default=ExamStatus.DRAFT,
        nullable=False,
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )

    paper: Mapped[Paper] = relationship(back_populates="exams")
    creator: Mapped[User] = relationship(back_populates="created_exams")
    targets: Mapped[list[ExamTarget]] = relationship(
        back_populates="exam",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ExamTarget.id",
    )
    snapshot_questions: Mapped[list[ExamQuestion]] = relationship(
        back_populates="exam",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ExamQuestion.sort_order",
    )
    attempts: Mapped[list[ExamAttempt]] = relationship(back_populates="exam")


class ExamTarget(CreatedAtMixin, Base):
    __tablename__ = "exam_targets"
    __table_args__ = (
        CheckConstraint(
            "(target_type = 'all' AND target_id IS NULL) OR "
            "(target_type IN ('major', 'class') AND target_id IS NOT NULL)",
            name="target_reference_valid",
        ),
        UniqueConstraint(
            "exam_id",
            "target_type",
            "target_id",
            name="uq_exam_targets_exam_id_target_type_target_id",
        ),
        Index("ix_exam_targets_exam_id", "exam_id"),
        Index("ix_exam_targets_target_type_target_id", "target_type", "target_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    exam_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_type: Mapped[ExamTargetType] = mapped_column(
        exam_target_type(),
        nullable=False,
    )
    # Controlled polymorphic reference: Service validates majors/classes by target_type.
    target_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    exam: Mapped[Exam] = relationship(back_populates="targets")


class ExamQuestion(CreatedAtMixin, Base):
    __tablename__ = "exam_questions"
    __table_args__ = (
        UniqueConstraint(
            "exam_id",
            "sort_order",
            name="uq_exam_questions_exam_id_sort_order",
        ),
        CheckConstraint("score > 0", name="score_positive"),
        Index("ix_exam_questions_exam_id", "exam_id"),
        Index("ix_exam_questions_original_question_id", "original_question_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    exam_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False,
    )
    original_question_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    question_type: Mapped[QuestionType] = mapped_column(
        question_type_column(),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list[dict[str, str | int]] | None] = mapped_column(
        JSON,
        nullable=True,
    )
    correct_answer: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    reference_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)

    exam: Mapped[Exam] = relationship(back_populates="snapshot_questions")
    answers: Mapped[list[ExamAnswer]] = relationship(back_populates="exam_question")
