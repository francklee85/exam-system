from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.enums import RecordStatus


class ClassWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    major_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=50)
    enrollment_year: int | None = Field(default=None, ge=1900, le=2100)
    description: str | None = Field(default=None, max_length=500)

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, value: object) -> object:
        return value.strip().upper() if isinstance(value, str) else value

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, value: object) -> object:
        if isinstance(value, str):
            stripped_value = value.strip()
            return stripped_value or None
        return value


class ClassCreate(ClassWrite):
    pass


class ClassUpdate(ClassWrite):
    pass


class ClassMajorSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str


class ClassResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    major_id: int
    name: str
    code: str
    enrollment_year: int | None
    description: str | None
    status: RecordStatus
    created_at: datetime
    updated_at: datetime
    major: ClassMajorSummary
