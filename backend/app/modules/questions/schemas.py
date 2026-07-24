from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator

from app.db.enums import RecordStatus
from app.modules.questions.enums import QuestionDifficulty, QuestionType


class QuestionOptionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    option_key: str = Field(min_length=1, max_length=10, pattern=r"^[A-Z]+$")
    option_content: str = Field(min_length=1)
    sort_order: int = Field(ge=0)

    @field_validator("option_key", mode="before")
    @classmethod
    def normalize_option_key(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("option_content", mode="before")
    @classmethod
    def normalize_option_content(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class QuestionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_type: QuestionType
    content: str = Field(min_length=1)
    options: list[QuestionOptionCreate] = Field(default_factory=list)
    correct_answer: list[StrictStr] | None = None
    reference_answer: str | None = None
    analysis: str | None = None
    difficulty: QuestionDifficulty

    @field_validator("content", mode="before")
    @classmethod
    def normalize_content(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("reference_answer", "analysis", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


class QuestionCreate(QuestionWrite):
    pass


class QuestionUpdate(QuestionWrite):
    pass


class QuestionOptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    option_key: str
    option_content: str
    sort_order: int
    created_at: datetime
    updated_at: datetime


class QuestionCreatorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    real_name: str


class QuestionListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question_type: QuestionType
    content: str
    difficulty: QuestionDifficulty
    status: RecordStatus
    created_by: QuestionCreatorResponse = Field(validation_alias="creator")
    created_at: datetime
    updated_at: datetime


class QuestionResponse(QuestionListItem):
    options: list[QuestionOptionResponse]
    correct_answer: list[str] | None
    reference_answer: str | None
    analysis: str | None
