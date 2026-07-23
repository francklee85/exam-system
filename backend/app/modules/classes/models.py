from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, Index, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.enums import RecordStatus, record_status_type
from app.db.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.modules.majors.models import Major
    from app.modules.students.models import StudentProfile


class Class(TimestampMixin, Base):
    __tablename__ = "classes"
    __table_args__ = (
        Index("ix_classes_major_id", "major_id"),
        Index("ix_classes_status", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    major_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("majors.id"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    enrollment_year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[RecordStatus] = mapped_column(
        record_status_type(),
        default=RecordStatus.ACTIVE,
        nullable=False,
    )

    major: Mapped[Major] = relationship(back_populates="classes")
    student_profiles: Mapped[list[StudentProfile]] = relationship(back_populates="student_class")
