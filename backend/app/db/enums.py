from enum import StrEnum

from sqlalchemy import Enum


class RecordStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


def _record_status_values(enum_class: type[RecordStatus]) -> list[str]:
    return [member.value for member in enum_class]


def record_status_type() -> Enum[RecordStatus]:
    """Store RecordStatus as a validated VARCHAR(20), not a native DB enum."""
    return Enum(
        RecordStatus,
        name="record_status",
        native_enum=False,
        length=20,
        validate_strings=True,
        values_callable=_record_status_values,
    )
