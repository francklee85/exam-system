from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.modules.classes.models import Class
    from app.modules.users.models import User


class StudentProfile(TimestampMixin, Base):
    __tablename__ = "student_profiles"
    __table_args__ = (Index("ix_student_profiles_class_id", "class_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id"),
        nullable=False,
        unique=True,
    )
    student_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    class_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("classes.id"),
        nullable=False,
    )

    user: Mapped[User] = relationship(back_populates="student_profile")
    student_class: Mapped[Class] = relationship(back_populates="student_profiles")
