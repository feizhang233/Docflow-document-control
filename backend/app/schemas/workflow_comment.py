from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WorkflowCommentInput(BaseModel):
    external_id: str | None = Field(default=None, max_length=255)
    author: str | None = Field(default=None, max_length=255)
    body: str = Field(min_length=1, max_length=1_000_000)
    commented_at: datetime | None = None


class WorkflowCommentsWrite(BaseModel):
    comments: list[WorkflowCommentInput] = Field(max_length=1_000)


class WorkflowCommentsImportItem(BaseModel):
    """One workflow's complete comment snapshot for bulk import."""

    workflow_number: str = Field(min_length=1, max_length=80)
    comments: list[WorkflowCommentInput] = Field(max_length=1_000)


class WorkflowCommentsBulkImport(BaseModel):
    """Import complete workflow comment snapshots for many workflows at once."""

    items: list[WorkflowCommentsImportItem] = Field(min_length=1, max_length=5_000)


class WorkflowCommentRead(BaseModel):
    id: int
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


class WorkflowCommentsImportResultItem(BaseModel):
    workflow_number: str
    status: Literal["imported"]
    total: int = 0


class WorkflowCommentsBulkImportResult(BaseModel):
    imported: int
    results: list[WorkflowCommentsImportResultItem]
