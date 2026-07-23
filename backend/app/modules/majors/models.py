from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.enums import RecordStatus, record_status_type
from app.db.mixins import TimestampMixin

if TYPE_CHECKING:
    from app.modules.classes.models import Class


class Major(TimestampMixin, Base):
    __tablename__ = "majors"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[RecordStatus] = mapped_column(
        record_status_type(),
        default=RecordStatus.ACTIVE,
        nullable=False,
    )

    classes: Mapped[list[Class]] = relationship(back_populates="major")
