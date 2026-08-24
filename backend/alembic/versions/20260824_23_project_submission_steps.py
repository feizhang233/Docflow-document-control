"""per-project submission progress stages

Revision ID: 20260824_23
Revises: 20260824_22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260824_23"
down_revision: Union[str, None] = "20260824_22"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("workflow_configs")}
    if "project_submission_steps" not in columns:
        op.add_column("workflow_configs", sa.Column("project_submission_steps", sa.JSON(), nullable=True))
        if bind.dialect.name == "mysql":
            op.execute(sa.text("UPDATE workflow_configs SET project_submission_steps = CAST('{}' AS JSON) WHERE project_submission_steps IS NULL"))
        else:
            op.execute(sa.text("UPDATE workflow_configs SET project_submission_steps = '{}' WHERE project_submission_steps IS NULL"))
        with op.batch_alter_table("workflow_configs") as batch:
            batch.alter_column("project_submission_steps", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("workflow_configs")}
    if "project_submission_steps" in columns:
        op.drop_column("workflow_configs", "project_submission_steps")
