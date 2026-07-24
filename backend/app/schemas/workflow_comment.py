from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WorkflowCommentInput(BaseModel):
    external_id: str | None = Field(default=None, max_length=255)
    author: str | None = Field(default=None, max_length=255)
    body: str = Field(min_length=1, max_length=1_000_000)
    commented_at: datetime | None = None


class WorkflowCommentsWrite(BaseModel):
    comments: list[WorkflowCommentInput] = Field(max_length=1_000)


class WorkflowCommentRead(BaseModel):
    id: int
    package_id: int
    workflow_number: str
    external_id: str | None
    author: str | None
    body: str
    commented_at: datetime | None
    order_index: int
    synced_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkflowCommentList(BaseModel):
    items: list[WorkflowCommentRead]
    total: int
