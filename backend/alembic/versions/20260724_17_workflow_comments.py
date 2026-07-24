"""store complete workflow comments

Revision ID: 20260724_17
Revises: 20260715_16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision: str = "20260724_17"
down_revision: Union[str, None] = "20260715_16"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _long_text_type():
    if op.get_bind().dialect.name == "mysql":
        return mysql.LONGTEXT()
    return sa.Text()


def upgrade() -> None:
    long_text = _long_text_type()
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("notifications") as batch_op:
            batch_op.alter_column(
                "message",
                existing_type=sa.String(length=500),
                type_=long_text,
                existing_nullable=False,
            )
    else:
        op.alter_column(
            "notifications",
            "message",
            existing_type=sa.String(length=500),
            type_=long_text,
            existing_nullable=False,
        )

    op.create_table(
        "workflow_comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("package_id", sa.Integer(), nullable=False),
        sa.Column("workflow_number", sa.String(length=80), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=True),
        sa.Column("author", sa.String(length=255), nullable=True),
        sa.Column("body", long_text, nullable=False),
        sa.Column("commented_at", sa.DateTime(), nullable=True),
        sa.Column(
            "order_index",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "synced_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name="fk_workflow_comments_package_id_packages",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_workflow_comments_package_id",
        "workflow_comments",
        ["package_id"],
    )
    op.create_index(
        "ix_workflow_comments_workflow_number",
        "workflow_comments",
        ["workflow_number"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_workflow_comments_workflow_number",
        table_name="workflow_comments",
    )
    op.drop_index(
        "ix_workflow_comments_package_id",
        table_name="workflow_comments",
    )
    op.drop_table("workflow_comments")

    if op.get_bind().dialect.name == "mysql":
        op.execute(
            sa.text(
                "UPDATE notifications SET message = LEFT(message, 500)"
            )
        )
    else:
        op.execute(
            sa.text(
                "UPDATE notifications SET message = substr(message, 1, 500)"
            )
        )

    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("notifications") as batch_op:
            batch_op.alter_column(
                "message",
                existing_type=sa.Text(),
                type_=sa.String(length=500),
                existing_nullable=False,
            )
    else:
        op.alter_column(
            "notifications",
            "message",
            existing_type=_long_text_type(),
            type_=sa.String(length=500),
            existing_nullable=False,
        )
