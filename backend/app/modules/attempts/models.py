from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin
from app.modules.attempts.enums import (
    AnswerGradingStatus,
    AttemptGradingStatus,
    ExamAttemptStatus,
    answer_grading_status_type,
    attempt_grading_status_type,
    exam_attempt_status_type,
)

if TYPE_CHECKING:
    from app.modules.exams.models import Exam, ExamQuestion
    from app.modules.users.models import User


class ExamAttempt(TimestampMixin, Base):
    __tablename__ = "exam_attempts"
    __table_args__ = (
        UniqueConstraint(
            "exam_id",
            "student_user_id",
            name="uq_exam_attempts_exam_id_student_user_id",
        ),
        Index("ix_exam_attempts_exam_id", "exam_id"),
        Index("ix_exam_attempts_student_user_id", "student_user_id"),
        Index("ix_exam_attempts_status", "status"),
        Index("ix_exam_attempts_deadline_at", "deadline_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    exam_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("exams.id"),
        nullable=False,
    )
    student_user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )
    status: Mapped[ExamAttemptStatus] = mapped_column(
        exam_attempt_status_type(),
        default=ExamAttemptStatus.IN_PROGRESS,
        nullable=False,
    )
    grading_status: Mapped[AttemptGradingStatus] = mapped_column(
        attempt_grading_status_type(),
        default=AttemptGradingStatus.NOT_STARTED,
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    deadline_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    score: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    is_passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    exam: Mapped[Exam] = relationship(back_populates="attempts")
    student: Mapped[User] = relationship(
        back_populates="exam_attempts",
        foreign_keys=[student_user_id],
    )
    answers: Mapped[list[ExamAnswer]] = relationship(
        back_populates="attempt",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ExamAnswer(TimestampMixin, Base):
    __tablename__ = "exam_answers"
    __table_args__ = (
        UniqueConstraint(
            "attempt_id",
            "exam_question_id",
            name="uq_exam_answers_attempt_id_exam_question_id",
        ),
        Index("ix_exam_answers_attempt_id", "attempt_id"),
        Index("ix_exam_answers_exam_question_id", "exam_question_id"),
        Index("ix_exam_answers_grader_id", "grader_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("exam_attempts.id", ondelete="CASCADE"),
        nullable=False,
    )
    exam_question_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("exam_questions.id"),
        nullable=False,
    )
    answer: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    score_awarded: Mapped[Decimal | None] = mapped_column(
        Numeric(6, 2),
        nullable=True,
    )
    grading_status: Mapped[AnswerGradingStatus] = mapped_column(
        answer_grading_status_type(),
        default=AnswerGradingStatus.NOT_GRADED,
        nullable=False,
    )
    grader_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=True,
    )
    grading_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    attempt: Mapped[ExamAttempt] = relationship(back_populates="answers")
    exam_question: Mapped[ExamQuestion] = relationship(back_populates="answers")
    grader: Mapped[User | None] = relationship(
        back_populates="graded_exam_answers",
        foreign_keys=[grader_id],
    )
