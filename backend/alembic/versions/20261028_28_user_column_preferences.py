"""Persist column visibility separately for each account and register.

Revision ID: 20261028_28
Revises: 20261009_27
"""
from alembic import op
import sqlalchemy as sa


revision = "20261028_28"
down_revision = "20261009_27"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_column_preferences",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("register", sa.String(20), nullable=False),
        sa.Column("visibility", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "register"),
    )


def downgrade():
    op.drop_table("user_column_preferences")
