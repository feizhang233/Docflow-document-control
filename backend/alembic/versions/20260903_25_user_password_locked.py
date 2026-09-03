"""lockable user passwords for the shared guest account

Revision ID: 20260903_25
Revises: 20260824_24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260903_25"
down_revision: Union[str, None] = "20260824_24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "password_locked" not in columns:
        op.add_column(
            "users",
            sa.Column("password_locked", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("users")}
    if "password_locked" in columns:
        op.drop_column("users", "password_locked")
