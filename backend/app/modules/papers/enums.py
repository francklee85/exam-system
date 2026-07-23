from enum import StrEnum

from sqlalchemy import Enum


class PaperStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    DISABLED = "disabled"


def _paper_status_values(enum_class: type[PaperStatus]) -> list[str]:
    return [member.value for member in enum_class]


def paper_status_type() -> Enum[PaperStatus]:
    """Store PaperStatus as a validated VARCHAR(20), not a native DB enum."""
    return Enum(
        PaperStatus,
        name="paper_status",
        native_enum=False,
        length=20,
        validate_strings=True,
        values_callable=_paper_status_values,
    )
