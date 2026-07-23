from pydantic import BaseModel, ConfigDict, Field

from app.db.enums import RecordStatus


class PageResponse[ItemT](BaseModel):
    items: list[ItemT]
    total: int
    page: int
    page_size: int


class StatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: RecordStatus = Field(description="active or disabled")
