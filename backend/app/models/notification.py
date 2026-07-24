from datetime import datetime
from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, func
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_is_read", "is_read"), Index("ix_notifications_created_at", "created_at"))
    id: Mapped[int] = mapped_column(primary_key=True)
    package_id: Mapped[int | None] = mapped_column(Integer, index=True)
    notification_type: Mapped[str] = mapped_column(String(40), default="workflow_feedback", nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    message: Mapped[str] = mapped_column(Text().with_variant(LONGTEXT(), "mysql"), nullable=False)
    workflow_number: Mapped[str | None] = mapped_column(String(80))
    document_number: Mapped[str | None] = mapped_column(String(80))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
