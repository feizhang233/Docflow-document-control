from datetime import datetime
from sqlalchemy import JSON, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class ProjectConfig(Base):
    __tablename__ = "project_configs"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    projects: Mapped[list[dict]] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
