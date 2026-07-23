from enum import StrEnum

from sqlalchemy import Enum


class QuestionType(StrEnum):
    SINGLE_CHOICE = "single_choice"
    MULTIPLE_CHOICE = "multiple_choice"
    TRUE_FALSE = "true_false"


class QuestionDifficulty(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


def _enum_values[EnumT: StrEnum](enum_class: type[EnumT]) -> list[str]:
    return [member.value for member in enum_class]


def question_type_column() -> Enum[QuestionType]:
    return Enum(
        QuestionType,
        name="question_type",
        native_enum=False,
        length=20,
        validate_strings=True,
        values_callable=_enum_values,
    )


def question_difficulty_column() -> Enum[QuestionDifficulty]:
    return Enum(
        QuestionDifficulty,
        name="question_difficulty",
        native_enum=False,
        length=20,
        validate_strings=True,
        values_callable=_enum_values,
    )
