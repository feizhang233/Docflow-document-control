"""add project code to document packages

Revision ID: 20260813_20
Revises: 20260812_19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260813_20"
down_revision: Union[str, None] = "20260812_19"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The server default assigns every existing register row to the NFS project.
    op.add_column(
        "packages",
        sa.Column("project_code", sa.String(length=3), nullable=False, server_default="NFS"),
    )
    op.create_index("ix_packages_project_code", "packages", ["project_code"])


def downgrade() -> None:
    op.drop_index("ix_packages_project_code", table_name="packages")
    op.drop_column("packages", "project_code")
