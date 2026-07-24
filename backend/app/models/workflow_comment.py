from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, func
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WorkflowComment(Base):
    """Final Mail comment snapshot keyed only by workflow number.

    Multiple packages may share a workflow number; they all read the same
    comment set. Import never matches on document/package name.
    """

    __tablename__ = "workflow_comments"
    __table_args__ = (
        Index("ix_workflow_comments_workflow_number", "workflow_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workflow_number: Mapped[str] = mapped_column(String(80), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(255))
    author: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(
        Text().with_variant(LONGTEXT(), "mysql"),
        nullable=False,
    )
    commented_at: Mapped[datetime | None] = mapped_column(DateTime)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )
