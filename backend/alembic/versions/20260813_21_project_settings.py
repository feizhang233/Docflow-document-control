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

DEFAULT_PROJECTS = (
    '[{"id":1,"code":"NFS","name":"NFS Main Project"},'
    '{"id":2,"code":"FST","name":"Fire Station"},'
    '{"id":3,"code":"FBP","name":"Footbridge"}]'
)


def upgrade() -> None:
    op.create_table(
        "project_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("projects", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.execute(sa.text(f"INSERT INTO project_configs (id, projects) VALUES (1, '{DEFAULT_PROJECTS}')"))
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
