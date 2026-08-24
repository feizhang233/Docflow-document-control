from datetime import datetime
from sqlalchemy import JSON, Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class ColumnConfig(Base):
    __tablename__ = "column_configs"
    id: Mapped[int] = mapped_column(primary_key=True)
    field_name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_visible_workflow: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_visible_transmittal: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    column_width: Mapped[int] = mapped_column(Integer, default=140, nullable=False)
    input_type: Mapped[str] = mapped_column(String(20), default="text", nullable=False)
    options: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    option_colors: Mapped[dict[str,str]] = mapped_column(JSON, default=dict, nullable=False)
    share_options: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    project_options: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    project_option_colors: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
