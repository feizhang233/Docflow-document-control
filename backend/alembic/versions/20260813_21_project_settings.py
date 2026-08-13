"""configurable project settings and longer project codes

Revision ID: 20260813_21
Revises: 20260813_20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260813_21"
down_revision: Union[str, None] = "20260813_20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_PROJECTS = [
    {"id": 1, "code": "NFS", "name": "NFS Main Project"},
    {"id": 2, "code": "FST", "name": "Fire Station"},
    {"id": 3, "code": "FBP", "name": "Footbridge"},
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "project_configs" not in inspector.get_table_names():
        op.create_table(
            "project_configs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("projects", sa.JSON(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
    existing = bind.execute(sa.text("SELECT COUNT(*) FROM project_configs")).scalar()
    if not existing:
        project_configs = sa.table(
            "project_configs",
            sa.column("id", sa.Integer),
            sa.column("projects", sa.JSON),
        )
        op.bulk_insert(project_configs, [{"id": 1, "projects": DEFAULT_PROJECTS}])
    with op.batch_alter_table("packages") as batch:
        batch.alter_column(
            "project_code",
            existing_type=sa.String(length=3),
            type_=sa.String(length=16),
            existing_nullable=False,
            existing_server_default="NFS",
        )


def downgrade() -> None:
    with op.batch_alter_table("packages") as batch:
        batch.alter_column(
            "project_code",
            existing_type=sa.String(length=16),
            type_=sa.String(length=3),
            existing_nullable=False,
            existing_server_default="NFS",
        )
    op.drop_table("project_configs")
