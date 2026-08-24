from datetime import datetime
from sqlalchemy import JSON, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class WorkflowConfig(Base):
    __tablename__ = "workflow_configs"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    submission_steps: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    project_submission_steps: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    feedback_reviewers: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    feedback_status_labels: Mapped[dict[str,str]] = mapped_column(JSON, nullable=False)
    feedback_status_colors: Mapped[dict[str,str]] = mapped_column(JSON, nullable=False)
    transmittal_prefixes: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
