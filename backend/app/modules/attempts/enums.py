from enum import StrEnum

from sqlalchemy import Enum


class ExamAttemptStatus(StrEnum):
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"


class AttemptGradingStatus(StrEnum):
    NOT_STARTED = "not_started"
    PENDING_MANUAL_GRADING = "pending_manual_grading"
    GRADED = "graded"


class AnswerGradingStatus(StrEnum):
    NOT_GRADED = "not_graded"
    PENDING = "pending"
    GRADED = "graded"


def _enum_values[EnumT: StrEnum](enum_class: type[EnumT]) -> list[str]:
    return [member.value for member in enum_class]


def exam_attempt_status_type() -> Enum[ExamAttemptStatus]:
    return Enum(
        ExamAttemptStatus,
        name="exam_attempt_status",
        native_enum=False,
        length=20,
        validate_strings=True,
        values_callable=_enum_values,
    )


def attempt_grading_status_type() -> Enum[AttemptGradingStatus]:
    return Enum(
        AttemptGradingStatus,
        name="attempt_grading_status",
        native_enum=False,
        length=30,
        validate_strings=True,
        values_callable=_enum_values,
    )


def answer_grading_status_type() -> Enum[AnswerGradingStatus]:
    return Enum(
        AnswerGradingStatus,
        name="answer_grading_status",
        native_enum=False,
        length=20,
        validate_strings=True,
        values_callable=_enum_values,
    )
