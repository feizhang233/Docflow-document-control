from datetime import date, datetime
from sqlalchemy import JSON, Boolean, Date, DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class Package(Base):
    __tablename__ = "packages"
    __table_args__ = (Index("ix_packages_created_at", "created_at"), Index("ix_packages_order_index", "order_index"), Index("ix_packages_project_code", "project_code"), Index("ix_packages_is_abandoned", "is_abandoned"), Index("ix_packages_workflow_terminated", "workflow_terminated"))
    id: Mapped[int] = mapped_column(primary_key=True)
    project_code: Mapped[str] = mapped_column(String(16), default="NFS", nullable=False)
    # Not unique: the same document number can appear as multiple revisions / submissions.
    document_number: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    document_title: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    document_date: Mapped[date] = mapped_column(Date, nullable=False, server_default=func.current_date())
    document_type: Mapped[str] = mapped_column(String(80), nullable=False)
    initiator: Mapped[str] = mapped_column(String(120), nullable=False)
    discipline: Mapped[str] = mapped_column(String(80), nullable=False)
    number_of_documents: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    transmittal_number: Mapped[str | None] = mapped_column(String(80), index=True)
    workflow_number: Mapped[str | None] = mapped_column(String(80), index=True)
    workflow_terminated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    has_attachment: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_abandoned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    submission_progress: Mapped[dict] = mapped_column(JSON, nullable=False)
    feedback: Mapped[dict] = mapped_column(JSON, nullable=False)
    feedback_status: Mapped[dict] = mapped_column(JSON, default=lambda: {"UTIBER":"P", "GDS":"P"}, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
