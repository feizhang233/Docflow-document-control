import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

EmailEventType = Literal["document", "submission_progress", "workflow_feedback", "workflow_comments"]
EMAIL_EVENTS = ["document", "submission_progress", "workflow_feedback", "workflow_comments"]


class EmailSubscriptionCreate(BaseModel):
    project_code: str = Field(min_length=2, max_length=16)
    email: str = Field(max_length=255)
    event_types: list[EmailEventType] = Field(default_factory=lambda: list(EMAIL_EVENTS), min_length=1)

    @field_validator("project_code")
    @classmethod
    def project(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("email")
    @classmethod
    def address(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}", value):
            raise ValueError("Enter a valid email address")
        local = value.split("@", 1)[0]
        if len(local) > 64 or local.startswith(".") or local.endswith(".") or ".." in local:
            raise ValueError("Enter a valid email address")
        return value


class EmailSubscriptionUpdate(BaseModel):
    is_active: bool


class EmailSubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_code: str
    email: str
    event_types: list[str]
    is_active: bool
    created_at: datetime
    last_delivery_status: str | None = None
    last_delivery_at: datetime | None = None
    last_error: str | None = None
    failed_count: int = 0
    pending_count: int = 0


class EmailSubscriptionList(BaseModel):
    items: list[EmailSubscriptionRead]
    total: int
    mail_configured: bool
    address_count: int
    address_limit: int = 5
