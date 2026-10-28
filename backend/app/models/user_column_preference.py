from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserColumnPreference(Base):
    __tablename__ = "user_column_preferences"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    register: Mapped[str] = mapped_column(String(20), primary_key=True)
    visibility: Mapped[dict[str, bool]] = mapped_column(JSON, default=dict, nullable=False)
    column_order: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
