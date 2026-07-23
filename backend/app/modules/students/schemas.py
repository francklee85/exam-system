from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.enums import RecordStatus
from app.modules.users.models import User
from app.modules.users.schemas import UserCreateInput, UserIdentityInput


class StudentCreate(UserCreateInput):
    student_no: str = Field(min_length=1, max_length=50)
    class_id: int = Field(gt=0)

    @field_validator("student_no", mode="before")
    @classmethod
    def normalize_student_no(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class StudentUpdate(UserIdentityInput):
    student_no: str = Field(min_length=1, max_length=50)
    class_id: int = Field(gt=0)

    @field_validator("student_no", mode="before")
    @classmethod
    def normalize_student_no(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class ClassSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str


class MajorSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str


class StudentResponse(BaseModel):
    id: int
    username: str
    real_name: str
    student_no: str
    status: RecordStatus
    roles: list[str]
    student_class: ClassSummary = Field(serialization_alias="class")
    major: MajorSummary
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_user(cls, user: User) -> Self:
        profile = user.student_profile
        if profile is None:
            raise ValueError("student profile is not loaded")
        student_class = profile.student_class
        return cls(
            id=user.id,
            username=user.username,
            real_name=user.real_name,
            student_no=profile.student_no,
            status=user.status,
            roles=sorted(role.code for role in user.roles),
            student_class=ClassSummary.model_validate(student_class),
            major=MajorSummary.model_validate(student_class.major),
            created_at=user.created_at,
            updated_at=user.updated_at,
        )
