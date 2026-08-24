"""per-project initiator and discipline option pools

Revision ID: 20260824_24
Revises: 20260824_23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260824_24"
down_revision: Union[str, None] = "20260824_23"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("column_configs")}
    if "share_options" not in columns:
        op.add_column("column_configs", sa.Column("share_options", sa.Boolean(), nullable=False, server_default=sa.true()))
    if "project_options" not in columns:
        op.add_column("column_configs", sa.Column("project_options", sa.JSON(), nullable=True))
        if bind.dialect.name == "mysql":
            op.execute(sa.text("UPDATE column_configs SET project_options = CAST('{}' AS JSON) WHERE project_options IS NULL"))
        else:
            op.execute(sa.text("UPDATE column_configs SET project_options = '{}' WHERE project_options IS NULL"))
        with op.batch_alter_table("column_configs") as batch:
            batch.alter_column("project_options", existing_type=sa.JSON(), nullable=False)
    if "project_option_colors" not in columns:
        op.add_column("column_configs", sa.Column("project_option_colors", sa.JSON(), nullable=True))
        if bind.dialect.name == "mysql":
            op.execute(sa.text("UPDATE column_configs SET project_option_colors = CAST('{}' AS JSON) WHERE project_option_colors IS NULL"))
        else:
            op.execute(sa.text("UPDATE column_configs SET project_option_colors = '{}' WHERE project_option_colors IS NULL"))
        with op.batch_alter_table("column_configs") as batch:
            batch.alter_column("project_option_colors", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("column_configs")}
    with op.batch_alter_table("column_configs") as batch:
        if "project_option_colors" in columns:
            batch.drop_column("project_option_colors")
        if "project_options" in columns:
            batch.drop_column("project_options")
        if "share_options" in columns:
            batch.drop_column("share_options")
