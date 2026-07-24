from datetime import datetime
from decimal import Decimal
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.enums import RecordStatus
from app.modules.papers.enums import PaperStatus
from app.modules.papers.models import Paper, PaperQuestion
from app.modules.questions.enums import QuestionDifficulty, QuestionType


class PaperWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


class PaperCreate(PaperWrite):
    pass


class PaperUpdate(PaperWrite):
    pass


class PaperStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: PaperStatus


class PaperQuestionAdd(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: int = Field(gt=0)
    score: Decimal = Field(gt=0, max_digits=6, decimal_places=2)


class PaperQuestionBatchAdd(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[PaperQuestionAdd] = Field(min_length=1, max_length=100)


class PaperQuestionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: Decimal = Field(gt=0, max_digits=6, decimal_places=2)


class PaperReorderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paper_question_ids: list[int] = Field(min_length=1)


class PaperCreatorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    real_name: str


class PaperQuestionOptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    option_key: str
    option_content: str
    sort_order: int


class PaperQuestionResponse(BaseModel):
    paper_question_id: int
    question_id: int
    question_type: QuestionType
    content: str
    options: list[PaperQuestionOptionResponse]
    correct_answer: list[str] | None
    reference_answer: str | None
    analysis: str | None
    difficulty: QuestionDifficulty
    question_status: RecordStatus
    score: Decimal
    sort_order: int

    @classmethod
    def from_paper_question(cls, item: PaperQuestion) -> Self:
        question = item.question
        return cls(
            paper_question_id=item.id,
            question_id=question.id,
            question_type=question.question_type,
            content=question.content,
            options=[
                PaperQuestionOptionResponse.model_validate(option)
                for option in question.options
            ],
            correct_answer=question.correct_answer,
            reference_answer=question.reference_answer,
            analysis=question.analysis,
            difficulty=question.difficulty,
            question_status=question.status,
            score=item.score,
            sort_order=item.sort_order,
        )


class PaperListItem(BaseModel):
    id: int
    name: str
    description: str | None
    total_score: Decimal
    question_count: int
    status: PaperStatus
    creator: PaperCreatorResponse
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_paper(cls, paper: Paper, *, question_count: int) -> Self:
        return cls(
            id=paper.id,
            name=paper.name,
            description=paper.description,
            total_score=paper.total_score,
            question_count=question_count,
            status=paper.status,
            creator=PaperCreatorResponse.model_validate(paper.creator),
            created_at=paper.created_at,
            updated_at=paper.updated_at,
        )


class PaperResponse(PaperListItem):
    questions: list[PaperQuestionResponse]

    @classmethod
    def from_paper_detail(cls, paper: Paper) -> Self:
        return cls(
            **PaperListItem.from_paper(
                paper,
                question_count=len(paper.paper_questions),
            ).model_dump(),
            questions=[
                PaperQuestionResponse.from_paper_question(item)
                for item in paper.paper_questions
            ],
        )
