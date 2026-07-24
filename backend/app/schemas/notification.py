from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.schemas.package import FEEDBACK_STATUS_VALUES

class NotificationRead(BaseModel):
    id: int
    package_id: int | None
    notification_type: str
    title: str
    message: str
    workflow_number: str | None
    document_number: str | None
    is_read: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class NotificationList(BaseModel):
    items: list[NotificationRead]
    unread_count: int

class ExternalWorkflowUpdate(BaseModel):
    submission_progress: dict[str, bool] | None = None
    feedback: dict[str, bool] | None = None
    feedback_status: dict[str, str] | None = None
    terminate_workflow: bool | None = None
    message: str | None = Field(default=None, max_length=1_000_000)
    @field_validator("feedback_status")
    @classmethod
    def validate_feedback_status(cls, value):
        if value is not None and (len(value) > 2 or any(status not in FEEDBACK_STATUS_VALUES for status in value.values())):
            raise ValueError("Feedback statuses must use A, B, C, or P")
        return value
