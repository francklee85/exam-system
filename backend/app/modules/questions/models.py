from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    BigInteger,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.enums import RecordStatus, record_status_type
from app.db.mixins import TimestampMixin
from app.modules.questions.enums import (
    QuestionDifficulty,
    QuestionType,
    question_difficulty_column,
    question_type_column,
)

if TYPE_CHECKING:
    from app.modules.papers.models import PaperQuestion
    from app.modules.users.models import User


class Question(TimestampMixin, Base):
    __tablename__ = "questions"
    __table_args__ = (
        Index("ix_questions_question_type", "question_type"),
        Index("ix_questions_difficulty", "difficulty"),
        Index("ix_questions_status", "status"),
        Index("ix_questions_created_by", "created_by"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    question_type: Mapped[QuestionType] = mapped_column(
        question_type_column(),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    correct_answer: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty: Mapped[QuestionDifficulty] = mapped_column(
        question_difficulty_column(),
        nullable=False,
    )
    status: Mapped[RecordStatus] = mapped_column(
        record_status_type(),
        default=RecordStatus.ACTIVE,
        nullable=False,
    )
    created_by: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )

    creator: Mapped[User] = relationship(back_populates="created_questions")
    options: Mapped[list[QuestionOption]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="QuestionOption.sort_order",
    )
    paper_assignments: Mapped[list[PaperQuestion]] = relationship(
        back_populates="question",
    )


class QuestionOption(TimestampMixin, Base):
    __tablename__ = "question_options"
    __table_args__ = (
        UniqueConstraint(
            "question_id",
            "option_key",
            name="uq_question_options_question_id_option_key",
        ),
        Index("ix_question_options_question_id", "question_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
    )
    option_key: Mapped[str] = mapped_column(String(10), nullable=False)
    option_content: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)

    question: Mapped[Question] = relationship(back_populates="options")
