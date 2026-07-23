from datetime import datetime
from enum import StrEnum

from sqlalchemy import Enum


class ExamStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    FINISHED = "finished"


class ExamTargetType(StrEnum):
    ALL = "all"
    MAJOR = "major"
    CLASS = "class"


class ExamRuntimeStatus(StrEnum):
    DRAFT = "draft"
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    ENDED = "ended"
    FINISHED = "finished"


def _enum_values[EnumT: StrEnum](enum_class: type[EnumT]) -> list[str]:
    return [member.value for member in enum_class]


def exam_status_type() -> Enum[ExamStatus]:
    return Enum(
        ExamStatus,
        name="exam_status",
        native_enum=False,
        length=20,
        validate_strings=True,
        values_callable=_enum_values,
    )


def exam_target_type() -> Enum[ExamTargetType]:
    return Enum(
        ExamTargetType,
        name="exam_target_type",
        native_enum=False,
        length=20,
        validate_strings=True,
        values_callable=_enum_values,
    )


def calculate_runtime_status(
    status: ExamStatus,
    start_time: datetime,
    end_time: datetime,
    *,
    now: datetime,
) -> ExamRuntimeStatus:
    if status == ExamStatus.DRAFT:
        return ExamRuntimeStatus.DRAFT
    if status == ExamStatus.FINISHED:
        return ExamRuntimeStatus.FINISHED
    if now < start_time:
        return ExamRuntimeStatus.NOT_STARTED
    if now < end_time:
        return ExamRuntimeStatus.IN_PROGRESS
    return ExamRuntimeStatus.ENDED
