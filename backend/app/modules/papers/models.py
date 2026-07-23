from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
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
from app.db.mixins import TimestampMixin
from app.modules.papers.enums import PaperStatus, paper_status_type

if TYPE_CHECKING:
    from app.modules.questions.models import Question
    from app.modules.users.models import User


class Paper(TimestampMixin, Base):
    __tablename__ = "papers"
    __table_args__ = (
        Index("ix_papers_status", "status"),
        Index("ix_papers_created_by", "created_by"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_score: Mapped[Decimal] = mapped_column(
        Numeric(6, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    status: Mapped[PaperStatus] = mapped_column(
        paper_status_type(),
        default=PaperStatus.DRAFT,
        nullable=False,
    )
    created_by: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
    )

    creator: Mapped[User] = relationship(back_populates="created_papers")
    paper_questions: Mapped[list[PaperQuestion]] = relationship(
        back_populates="paper",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="PaperQuestion.sort_order",
    )


class PaperQuestion(TimestampMixin, Base):
    __tablename__ = "paper_questions"
    __table_args__ = (
        UniqueConstraint(
            "paper_id",
            "question_id",
            name="uq_paper_questions_paper_id_question_id",
        ),
        UniqueConstraint(
            "paper_id",
            "sort_order",
            name="uq_paper_questions_paper_id_sort_order",
        ),
        CheckConstraint("score > 0", name="score_positive"),
        Index("ix_paper_questions_paper_id", "paper_id"),
        Index("ix_paper_questions_question_id", "question_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    paper_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
    )
    question_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("questions.id"),
        nullable=False,
    )
    score: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)

    paper: Mapped[Paper] = relationship(back_populates="paper_questions")
    question: Mapped[Question] = relationship(back_populates="paper_assignments")
